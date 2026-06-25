/**
 * @file Prepare-apply orchestrator — the credential-free handoff that ties
 * validate + diff + undo + irreversible-flagging into a single result, plus the
 * operator apply command and the honesty notice.
 *
 * This is the read-only culmination of the "prepare to apply" pipeline. Given a
 * proposed blueprint, it:
 *
 *   1. Validates FIRST (the policy-enforcement point). If the blueprint is not
 *      mechanically safe, it returns the violations and NOTHING else — no diff,
 *      no undo, no apply command. We never prepare an invalid thing.
 *   2. For a valid blueprint, computes the trusted server-side diff (the full,
 *      un-collapsed object list) and the undo snapshot (restore point +
 *      reversibility), flags the destructive entries, and emits the operator's
 *      apply command together with an honesty notice.
 *
 * The MCP NEVER applies a blueprint. This returns artifacts only: the operator
 * runs the apply themselves on the host. For a destructive change the smooth
 * `applyCommand` is deliberately withheld and the notice steers the operator to
 * the manual host-CLI path, so a delete or crypto touch is never a one-liner.
 *
 * Reads only: every call goes through the `Ak` read client as a GET.
 */

import { parse } from "yaml";

import { validateBlueprint, type FlagItem } from "#blueprint-validate";
import {
    computeDiff,
    type BlueprintDiff,
    type ParsedEntry,
} from "#blueprint-diff";
import { buildUndoSnapshot, type UndoSnapshot } from "#blueprint-undo";
import { isDestructiveEntry } from "#blueprint-policy";
import { isObject } from "#predicates";
import type { Ak } from "#client";

/**
 * The complete prepare-apply result handed to the operator.
 *
 * On an invalid blueprint only `ok`/`violations`/`flags` are meaningful;
 * `destructive` is false, `applyCommand`/`notice` are empty, and `diff`/`undo`
 * are absent. On a valid blueprint all fields are populated (with the caveat
 * that a destructive change withholds the smooth `applyCommand`).
 */
export interface PrepareResult {
    ok: boolean;
    violations: string[];
    flags: FlagItem[];
    diff?: BlueprintDiff;
    undo?: UndoSnapshot;
    destructive: boolean;
    applyCommand: string;
    notice: string;
}

/** Placeholder filename for the operator's apply command. */
const APPLY_FILE = "<file>";

/**
 * The honesty notice. It states plainly what the validator did and did NOT do:
 * the change is mechanically safe, but the operator remains responsible for the
 * flagged attributes and the full object list, and this tool will not apply the
 * change. Reused (with a destructive prefix) for both paths.
 */
const HONESTY_NOTICE =
    "This blueprint has been validated as mechanically safe; you remain " +
    "responsible for the flagged attributes and the object list; this tool " +
    "will not apply the change.";

/**
 * Extra guidance for a destructive change (a delete or crypto touch). The
 * smooth one-line apply command is withheld; the operator must run the apply
 * manually on the host via the authentik CLI, having reviewed the diff and the
 * undo snapshot's reversibility notes first.
 */
const DESTRUCTIVE_NOTICE =
    "This change is DESTRUCTIVE (a delete or crypto change) and cannot be " +
    "cleanly undone. No one-line apply command is offered: review the diff and " +
    "the undo snapshot, then apply it manually on the host with the authentik " +
    "CLI (`ak apply_blueprint <file>`). " +
    HONESTY_NOTICE;

/**
 * Project a raw parsed blueprint entry into the {@link ParsedEntry} shape the
 * diff/undo readers consume: model, the identifiers that locate the live object,
 * the attrs to compare, and the optional state (`absent` for a delete).
 *
 * Defensive: `parse` returns `unknown`-shaped data, so every field is read
 * guardedly and defaults to a safe empty value.
 */
function toParsedEntry(raw: unknown): ParsedEntry & { state?: string } {
    const obj = (raw ?? {}) as Record<string, unknown>;

    const model = typeof obj.model === "string" ? obj.model : "";

    const rawIDs = obj.identifiers;
    const identifiers =
        isObject(rawIDs) && !Array.isArray(rawIDs) ? rawIDs : {};

    const rawAttrs = obj.attrs;
    const attrs =
        isObject(rawAttrs) && !Array.isArray(rawAttrs) ? rawAttrs : {};

    const state = typeof obj.state === "string" ? obj.state : undefined;

    return {
        model,
        identifiers,
        attrs,
        ...(state !== undefined ? { state } : {}),
    };
}

/**
 * Prepare a proposed blueprint for the operator to apply, credential-free.
 *
 * Validates first; if the blueprint is not mechanically safe, returns the
 * violations and no apply artifacts. Otherwise computes the trusted diff + undo
 * snapshot, flags destructive entries, and returns the apply command and the
 * honesty notice. Never applies the blueprint.
 */
export async function prepareApply(
    content: string,
    ak: Ak,
): Promise<PrepareResult> {
    // --- Validate FIRST: never prepare an invalid thing. ---
    const validation = validateBlueprint(content);

    if (!validation.ok) {
        return {
            ok: false,
            violations: validation.violations,
            flags: validation.flags,
            destructive: false,
            applyCommand: "",
            notice: "",
        };
    }

    // The validator already rejected unparseable / multi-document YAML, so a
    // single-document parse here is safe. Reuse the same `yaml` parse to derive
    // the entries the diff/undo readers consume.
    const doc = parse(content) as { entries?: unknown };
    const rawEntries = Array.isArray(doc?.entries) ? doc.entries : [];
    const entries = rawEntries.map(toParsedEntry);

    // --- Read-only artifacts: trusted diff + undo snapshot. ---
    const diff = await computeDiff(entries, ak);
    const undo = await buildUndoSnapshot(entries, ak);

    // A change is destructive if ANY entry deletes a model or touches crypto.
    const destructive = entries.some((e) =>
        isDestructiveEntry(e.model, e.state),
    );

    // A destructive change withholds the smooth apply command and steers the
    // operator to the manual host-CLI path; a safe change offers the one-liner.
    const applyCommand = destructive ? "" : `ak apply_blueprint ${APPLY_FILE}`;
    const notice = destructive ? DESTRUCTIVE_NOTICE : HONESTY_NOTICE;

    return {
        ok: true,
        violations: validation.violations,
        flags: validation.flags,
        diff,
        undo,
        destructive,
        applyCommand,
        notice,
    };
}
