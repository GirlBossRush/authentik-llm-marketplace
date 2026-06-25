/**
 * @file Undo snapshot + reversibility classification: the second read-only half
 * of the credential-free "prepare to apply" handoff (Task 5 consumes this).
 *
 * Before an operator applies a proposed blueprint, this module reads the CURRENT
 * live state of each object the blueprint would touch and emits a "restore
 * point" blueprint (YAML) that, re-applied, reverts a pure-config change. It also
 * classifies how cleanly the change can be undone:
 *
 *   - `clean`      pure attribute update of an existing object (same UUID): the
 *                  restore point sets the touched fields back to their current
 *                  values, leaving the object (and every reference to it) intact.
 *   - `lossy`      create-only: the object does not exist yet, so undo means
 *                  delete. A later recreate churns the UUID and any references, so
 *                  the data is not byte-for-byte recoverable.
 *   - `impossible` a delete (`state: absent`) or any crypto object, or any other
 *                  external side-effect: there is nothing this snapshot can do to
 *                  restore it. Always accompanied by a clear `notes` entry.
 *
 * The overall reversibility is the worst of any entry: any `impossible` wins,
 * else any `lossy`, else `clean`.
 *
 * Reads only: every call goes through the `Ak` read client as a GET. The client
 * already blocks writes and secret-reveal paths.
 */

import { stringify } from "yaml";
import type { Ak } from "#client";
import type { ParsedEntry } from "#blueprint-diff";
import { isDestructiveEntry } from "#blueprint-policy";

/** How cleanly a proposed change can be reverted by the restore point. */
export type Reversibility = "clean" | "lossy" | "impossible";

/** The restore point plus its reversibility classification. */
export interface UndoSnapshot {
    /** A restore-point blueprint (YAML) capturing pre-apply live state. */
    blueprint: string;
    /** Worst-case reversibility across all entries (see module docs). */
    reversibility: Reversibility;
    /** Human-readable caveats, one per entry that can't be cleanly undone. */
    notes: string[];
}

/**
 * Maps a blueprint model to its read-only list endpoint and the query parameters
 * the endpoint accepts as exact filters. Mirrors the mapping in
 * `blueprint-diff.ts`; identifiers not listed here fall back to client-side
 * matching against the returned results.
 */
const MODEL_LIST: Readonly<
    Record<
        string,
        { path: string; filterParams: readonly string[]; wideFetch?: boolean }
    >
> = {
    "authentik_core.application": {
        path: "/core/applications/",
        filterParams: ["slug"],
    },
    "authentik_providers_oauth2.oauth2provider": {
        path: "/providers/oauth2/",
        filterParams: [],
        wideFetch: true,
    },
    "authentik_providers_saml.samlprovider": {
        path: "/providers/saml/",
        filterParams: [],
        wideFetch: true,
    },
};

/** The largest page size authentik's DRF list endpoints accept. */
const MAX_PAGE_SIZE = 100;

/** True if `obj` matches every identifier field exactly. */
function matchesIdentifiers(
    obj: Record<string, unknown>,
    identifiers: Record<string, unknown>,
): boolean {
    for (const [key, value] of Object.entries(identifiers)) {
        if (obj[key] !== value) return false;
    }
    return true;
}

/** Extract the `results` array from a DRF list response, defensively. */
function extractResults(data: unknown): Record<string, unknown>[] {
    if (data && typeof data === "object" && "results" in data) {
        const results = (data as { results: unknown }).results;
        if (Array.isArray(results)) {
            return results.filter(
                (r): r is Record<string, unknown> =>
                    r != null && typeof r === "object",
            );
        }
    }
    return [];
}

/**
 * Look up the live object matching an entry, or `null` if it could not be
 * positively found (absent, unmapped model, non-200 read). Always GETs the
 * model's list endpoint and re-checks every identifier client-side, so a
 * non-filtering endpoint can never produce a false match.
 */
async function findLiveObject(
    entry: ParsedEntry,
    ak: Ak,
): Promise<Record<string, unknown> | null> {
    const mapping = MODEL_LIST[entry.model];
    if (!mapping) return null;

    const query: Record<string, string | number> = {};
    for (const param of mapping.filterParams) {
        const value = entry.identifiers[param];
        if (value !== undefined && value !== null) {
            query[param] = String(value);
        }
    }
    if (mapping.wideFetch) {
        query.page_size = MAX_PAGE_SIZE;
    }

    const res = await ak.request("GET", mapping.path, { query });
    if (res.status !== 200) return null;

    const results = extractResults(res.data);
    return (
        results.find((obj) => matchesIdentifiers(obj, entry.identifiers)) ??
        null
    );
}

/** Render an identifiers map as a stable, readable string for a note. */
function formatIdentifier(identifiers: Record<string, unknown>): string {
    return Object.entries(identifiers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(",");
}

/** A single entry of the emitted restore-point blueprint. */
interface RestoreEntry {
    model: string;
    identifiers: Record<string, unknown>;
    attrs: Record<string, unknown>;
}

/**
 * Build the undo snapshot for a proposed set of blueprint entries.
 *
 * For each entry, reads the object's current live state and — for a pure update
 * of an existing object — records a restore entry that sets exactly the touched
 * fields back to their current values. Classifies each entry and returns the
 * worst-case reversibility plus a note for every entry that can't be cleanly
 * undone.
 */
export async function buildUndoSnapshot(
    entries: ParsedEntry[],
    ak: Ak,
): Promise<UndoSnapshot> {
    const restoreEntries: RestoreEntry[] = [];
    const notes: string[] = [];
    let reversibility: Reversibility = "clean";

    const worsen = (next: Reversibility): void => {
        if (next === "impossible") reversibility = "impossible";
        else if (next === "lossy" && reversibility !== "impossible") {
            reversibility = "lossy";
        }
    };

    for (const entry of entries) {
        const state = (entry as ParsedEntry & { state?: string }).state;
        const id = formatIdentifier(entry.identifiers);

        // Deletes and crypto (and any other destructive op) cannot be undone by
        // re-applying a config snapshot — there is no live state to capture.
        if (isDestructiveEntry(entry.model, state)) {
            worsen("impossible");
            notes.push(
                `${entry.model} (${id}): cannot be undone — destructive change (delete or crypto) or external side-effect`,
            );
            continue;
        }

        const live = await findLiveObject(entry, ak);
        const attrs = entry.attrs ?? {};

        if (live === null) {
            // Create-only: applying the blueprint creates the object, so undo is
            // a delete. A later recreate churns the UUID and any references.
            worsen("lossy");
            notes.push(
                `${entry.model} (${id}): create-only — undo is a delete; recreating later churns the object's UUID and any references`,
            );
            continue;
        }

        // Pure attribute update of an existing object (same UUID): the restore
        // point sets exactly the touched fields back to their current values.
        const restoreAttrs: Record<string, unknown> = {};
        for (const key of Object.keys(attrs)) {
            restoreAttrs[key] = live[key];
        }
        restoreEntries.push({
            model: entry.model,
            identifiers: entry.identifiers,
            attrs: restoreAttrs,
        });
    }

    const blueprint = stringify({
        version: 1,
        metadata: { name: "undo-snapshot" },
        entries: restoreEntries,
    });

    return { blueprint, reversibility, notes };
}
