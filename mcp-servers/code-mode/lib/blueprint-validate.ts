/** @file Validate a proposed authentik Blueprint without applying it (v2 policy-enforcement point). */

import {
    parseDocument,
    isMap,
    isSeq,
    isPair,
    isScalar,
    isNode,
    type Document,
    type Node,
} from "yaml";

import {
    ALLOWED_MODELS,
    MODEL_ATTRS,
    CURATED_REFS,
    EXCLUDED_SCOPES,
} from "#blueprint-policy";
import { isObject } from "#predicates";

// #region Public interfaces

export interface FlagItem {
    entryIndex: number;
    model: string;
    attr: string;
    value: unknown;
}

export interface BlueprintValidation {
    ok: boolean;
    violations: string[];
    flags: FlagItem[];
}

// #endregion

// #region Reference checking helpers

/**
 * Default-deny allow-list of YAML tags this validator understands AND can prove
 * safe. ANY node carrying a non-empty tag outside this set is rejected; we
 * enumerate only permitted tags, never dangerous ones. This structurally
 * closes whole classes of bypass (!FindObject, !Context, !Format, !Env, …).
 *
 * yaml v2 normalizes a local tag like `!Find` to the resolved form `!Find`
 * (handle/suffix); we compare against that exact string.
 */
const PERMITTED_TAGS: ReadonlySet<string> = new Set(["!Find", "!KeyOf"]);

/**
 * A tagged reference whose target we must curate-check.
 *  - For !Find: one entry per condition value (the scalar at index 1 of each
 *    [field, value] pair), each AND-combined server-side, so EVERY one matters.
 *  - For !KeyOf: the scalar id, which must reference an `id` defined within this
 *    same blueprint (self-contained).
 */
interface TaggedRef {
    tag: "!Find" | "!KeyOf";
    /** The resolved target string (scope slug, flow slug, signing-key name, or KeyOf id). */
    targetValue: string;
}

/**
 * Walk a yaml v2 Document AST, enforcing default-deny on tags and extracting
 * the curate-checkable target values from permitted (!Find / !KeyOf) nodes.
 *
 * Returns the collected refs and any structural violations found. NEVER throws:
 * every index access is guarded with isSeq/isScalar/isMap/isPair first, and the
 * caller additionally wraps this in try/catch.
 *
 * Note: yaml v2 uses .items on both YAMLMap (Pair objects) and YAMLSeq (child
 * nodes). Use the isMap/isSeq/isPair helpers — there is no "pairs" property.
 */
function collectTaggedRefs(node: Node | null | undefined): {
    refs: TaggedRef[];
    violations: string[];
} {
    const refs: TaggedRef[] = [];
    const violations: string[] = [];
    if (!isNode(node)) return { refs, violations };

    /** The resolved YAML tag on a node, or "" if untagged/absent. */
    function nodeTag(n: unknown): string {
        return isObject(n) && typeof n.tag === "string" ? n.tag : "";
    }

    /**
     * Validate and extract a !Find node. The ONLY understood shape mirrors
     * authentik's `Find.__init__`:
     *   !Find [ <model>, [field, scalar], [field, scalar], ... ]
     * - must be a sequence
     * - first item is the model name (scalar)
     * - each remaining item is a [field, scalar] pair (a 2-element sequence
     *   whose value at index 1 is a scalar)
     * Any deviation is a hard reject; we extract every condition value (all are
     * AND-combined server-side) so each is curate-checked.
     */
    function extractFind(n: Node): void {
        if (!isSeq(n)) {
            violations.push(
                "!Find must be a sequence [model, [field, value], ...]",
            );

            return;
        }

        const items = n.items;

        if (items.length < 2) {
            violations.push(
                "!Find must have a model and at least one [field, value] condition",
            );

            return;
        }

        const modelNode = items[0];

        // Default-deny: the understood `!Find` resolves at apply time
        // (common.py `Find._get_instance` `.resolve()`s any YAMLTag in the
        // model name and in BOTH halves of every condition). A nested tag here
        // is attacker-controlled lookup/IO (e.g. !Context model, !File field) —
        // reject any non-empty tag in the model / field / value positions. The
        // understood `!Find` contains ONLY plain, untagged scalars.
        if (nodeTag(modelNode) !== "") {
            violations.push(
                `!Find model name must be a plain untagged scalar, got tag "${nodeTag(modelNode)}"`,
            );

            return;
        }

        if (!(isScalar(modelNode) && typeof modelNode.value === "string")) {
            violations.push("!Find model name must be a scalar string");

            return;
        }

        // Each remaining item is a condition: [field, scalar].
        for (let i = 1; i < items.length; i++) {
            const cond = items[i];

            if (!isSeq(cond)) {
                violations.push(
                    "!Find condition must be a [field, value] sequence",
                );

                return;
            }

            if (cond.items.length !== 2) {
                violations.push(
                    "!Find condition must be exactly [field, value]",
                );

                return;
            }

            const fieldNode = cond.items[0];
            const valNode = cond.items[1];

            // Default-deny tags on BOTH items of the condition (field + value).
            if (nodeTag(fieldNode) !== "") {
                violations.push(
                    `!Find condition field must be a plain untagged scalar, got tag "${nodeTag(fieldNode)}"`,
                );

                return;
            }

            if (nodeTag(valNode) !== "") {
                violations.push(
                    `!Find condition value must be a plain untagged scalar, got tag "${nodeTag(valNode)}"`,
                );

                return;
            }

            if (!(isScalar(fieldNode) && typeof fieldNode.value === "string")) {
                violations.push(
                    "!Find condition field must be a scalar string",
                );

                return;
            }

            if (!isScalar(valNode)) {
                violations.push("!Find condition value must be a scalar");

                return;
            }

            if (typeof valNode.value !== "string") {
                violations.push(
                    "!Find condition value must be a scalar string",
                );

                return;
            }
            refs.push({ tag: "!Find", targetValue: valNode.value });
        }
    }

    function walk(n: Node | null | undefined): void {
        if (!isNode(n)) return;

        const tag = typeof n.tag === "string" ? n.tag : "";

        if (tag !== "") {
            if (!PERMITTED_TAGS.has(tag)) {
                // Default-deny: any unrecognized/unsafe tag is a hard reject.
                violations.push(
                    `tag "${tag}" is not permitted (only !Find and !KeyOf are allowed)`,
                );

                // Do not recurse into the rejected node — its shape is untrusted.
                return;
            }

            if (tag === "!Find") {
                extractFind(n);

                // extractFind already validated the shape and recursed where safe.
                return;
            }

            if (tag === "!KeyOf") {
                if (isScalar(n) && typeof n.value === "string") {
                    refs.push({ tag: "!KeyOf", targetValue: n.value });
                } else {
                    violations.push(
                        "!KeyOf must be a scalar id referencing an entry in this blueprint",
                    );
                }

                return;
            }
        }

        // walk and recurse are mutually recursive; function declarations hoist,
        // so this call is safe at runtime regardless of textual order.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        recurse(n);
    }

    function recurse(n: Node): void {
        if (isMap(n)) {
            for (const pair of n.items) {
                if (isPair(pair)) {
                    walk(pair.key as Node);
                    walk(pair.value as Node);
                }
            }
        } else if (isSeq(n)) {
            for (const item of n.items) {
                walk(item as Node);
            }
        } else if (isPair(n)) {
            walk(n.key as Node);
            walk(n.value as Node);
        }
    }

    walk(node);

    return { refs, violations };
}

/**
 * Return a violation message if a tagged reference is not curated, or null if
 * it is permitted. `definedIDs` is the set of entry `id`s in this blueprint,
 * used to validate that a !KeyOf target is self-contained.
 */
function checkRef(
    ref: TaggedRef,
    definedIDs: ReadonlySet<string>,
): string | null {
    const { targetValue } = ref;

    if (ref.tag === "!KeyOf") {
        // A !KeyOf target must reference an `id` defined within THIS blueprint.
        if (definedIDs.has(targetValue)) {
            return null;
        }

        return `!KeyOf "${targetValue}" does not reference an entry defined in this blueprint`;
    }

    // !Find condition value — must resolve to a curated built-in.

    // Excluded scopes are explicitly blocked (checked before the allow-list).
    if (EXCLUDED_SCOPES.has(targetValue)) {
        return `external reference "${targetValue}" is not permitted (excluded scope)`;
    }

    // Curated scope mappings (managed field values)
    if (CURATED_REFS.scopeMappings.includes(targetValue as never)) {
        return null;
    }

    // Curated flows (slug values)
    if (CURATED_REFS.flows.includes(targetValue as never)) {
        return null;
    }

    // Default signing key (name value)
    if (targetValue === CURATED_REFS.defaultSigningKeyName) {
        return null;
    }

    return `external reference "${targetValue}" is not permitted (only curated built-ins may be referenced)`;
}

/**
 * Locate the YAML AST value node for `entries[i].attrs[key]`, so a `ref`-binned
 * attribute can be checked for a *tag* (the plain JSON projection loses tags:
 * an unresolved !Find / !KeyOf both look like null/string). Returns null if the
 * path can't be resolved (callers treat that as "no node to inspect").
 *
 * Pure structural navigation; never throws (every step is guarded).
 */
function attrValueNode(
    contents: Node | null,
    entryIndex: number,
    attrKey: string,
): Node | null {
    if (!isMap(contents)) return null;
    let entriesNode: Node | null = null;

    for (const pair of contents.items) {
        if (
            isPair(pair) &&
            isScalar(pair.key) &&
            pair.key.value === "entries"
        ) {
            entriesNode = (pair.value as Node) ?? null;
            break;
        }
    }

    if (!isSeq(entriesNode)) return null;
    const entryNode = entriesNode.items[entryIndex];
    if (!isMap(entryNode as Node)) return null;
    let attrsNode: Node | null = null;

    for (const pair of (entryNode as { items: unknown[] }).items) {
        if (isPair(pair) && isScalar(pair.key) && pair.key.value === "attrs") {
            attrsNode = (pair.value as Node) ?? null;
            break;
        }
    }

    if (!isMap(attrsNode)) return null;

    for (const pair of attrsNode.items) {
        if (isPair(pair) && isScalar(pair.key) && pair.key.value === attrKey) {
            return (pair.value as Node) ?? null;
        }
    }

    return null;
}

const REF_PERMITTED_TAGS: ReadonlySet<string> = new Set(["!Find", "!KeyOf"]);

/**
 * A `ref`-binned attribute REQUIRES its value to be a permitted reference: a
 * curated !Find or a !KeyOf to an id defined in this blueprint. A plain literal
 * (string/number) or a non-permitted tag is rejected here; the curated-only
 * restriction on the referenced target is enforced by the tag walk + checkRef.
 *
 * The value may be a single tagged node, or a sequence of tagged nodes (e.g.
 * `property_mappings: [!Find …, !Find …]`). An empty sequence is permitted
 * (clearing the relation). Returns a violation string, or null if permitted.
 */
function checkRefAttr(node: Node | null): string | null {
    if (!isNode(node)) {
        return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
    }

    const tag = typeof node.tag === "string" ? node.tag : "";

    // A tagged node is a SINGLE reference (note: a `!Find` node is structurally
    // a YAMLSeq that carries the `!Find` tag — its tag must be inspected before
    // any isSeq() branch, or it would be misread as a plain list).
    if (tag !== "") {
        if (!REF_PERMITTED_TAGS.has(tag)) {
            return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
        }

        return null;
    }

    // An UNtagged sequence is a list of references (e.g. property_mappings):
    // each element must itself be a permitted single reference.
    if (isSeq(node)) {
        for (const item of node.items) {
            const itemTag =
                isNode(item) && typeof item.tag === "string" ? item.tag : "";

            if (
                typeof itemTag !== "string" ||
                !REF_PERMITTED_TAGS.has(itemTag)
            ) {
                return "every reference in the list must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
            }
        }

        return null;
    }

    // Untagged scalar / map → a plain literal, rejected.
    return "must be a permitted reference (a curated !Find or an in-blueprint !KeyOf), not a plain literal";
}

// #endregion

// #region Helpers

/**
 * Parse an authentik token validity value, which can be:
 * - a number (seconds)
 * - a string like "hours=1" or "seconds=3600"
 *
 * Returns the number of seconds, or null if unparseable.
 */
function parseTokenDuration(val: unknown): number | null {
    if (typeof val === "number") return val;

    if (typeof val === "string") {
        // authentik accepts timedelta strings like "hours=1;minutes=30"
        const match = /^(\d+)$/.exec(val.trim());
        if (match) return parseInt(match[1]!, 10);

        // Parse "key=value;key=value" style. Any unrecognized unit (or any
        // unparseable part) rejects the whole value — never silently ignore.
        let total = 0;
        let parsed = false;

        for (const part of val.split(";")) {
            if (part.trim() === "") continue; // tolerate trailing/empty segments
            const kv = /^\s*(\w+)\s*=\s*(\d+)\s*$/.exec(part.trim());
            if (!kv) return null;
            const [, unit, amount] = kv;
            parsed = true;
            const n = parseInt(amount!, 10);

            switch (unit) {
                case "seconds":
                    total += n;
                    break;
                case "minutes":
                    total += n * 60;
                    break;
                case "hours":
                    total += n * 3600;
                    break;
                case "days":
                    total += n * 86400;
                    break;
                case "weeks":
                    total += n * 604800;
                    break;
                default:
                    return null; // unknown unit → reject
            }
        }

        return parsed ? total : null;
    }

    return null;
}

// #endregion

// #region Main validator

export function validateBlueprint(content: string): BlueprintValidation {
    const violations: string[] = [];
    const flags: FlagItem[] = [];

    // --- Forbidden tag: !Env (raw scan before parse) ---
    if (/!Env\b/.test(content)) {
        violations.push("forbidden tag !Env (can read environment/secrets)");
    }

    // --- Multi-document rejection (raw scan) ---
    // authentik uses single-document YAML load; a `---` separator means a
    // second document is present that would be silently ignored by parse().
    if (/\n---(\s|$)/.test(content)) {
        violations.push(
            "multi-document YAML is not permitted; supply a single document",
        );

        return { ok: false, violations, flags };
    }

    // --- Parse with tag preservation ---
    let pdoc: Document;

    try {
        pdoc = parseDocument(content, { logLevel: "silent" });
    } catch (err) {
        return {
            ok: false,
            violations: [`unparseable YAML: ${(err as Error).message}`],
            flags,
        };
    }

    if (pdoc.errors.length > 0) {
        return {
            ok: false,
            violations: pdoc.errors.map((e) => `YAML error: ${e.message}`),
            flags,
        };
    }

    // Parse errors handled; get plain JSON for value checks
    let doc: unknown;

    try {
        doc = pdoc.toJSON() as unknown;
    } catch (err) {
        return {
            ok: false,
            violations: [`unparseable YAML: ${(err as Error).message}`],
            flags,
        };
    }

    const entries = (doc as { entries?: unknown })?.entries;

    if (!Array.isArray(entries)) {
        violations.push("blueprint has no `entries` list");

        return { ok: false, violations, flags };
    }

    // --- Collect the set of entry `id`s for self-contained !KeyOf checks ---
    const definedIDs = new Set<string>();

    for (const entry of entries) {
        const id = (entry as { id?: unknown })?.id;

        if (typeof id === "string" && id !== "") {
            definedIDs.add(id);
        }
    }

    entries.forEach((entry: unknown, i: number) => {
        const raw = entry as Record<string, unknown>;

        const rawModel = typeof raw?.model === "string" ? raw.model : "";

        if (!rawModel) {
            violations.push(`entry ${i}: missing model`);

            return;
        }

        // Normalize model name to lowercase
        const model = rawModel.toLowerCase();

        // --- Allow-list check ---
        if (!ALLOWED_MODELS.has(model)) {
            violations.push(
                `entry ${i}: model "${model}" is not in the allow-list (only curated models are permitted)`,
            );

            return; // skip attr checking for unknown model
        }

        // --- attrs must be a plain object ---
        const rawAttrs = raw.attrs;

        if (
            rawAttrs === null ||
            typeof rawAttrs !== "object" ||
            Array.isArray(rawAttrs)
        ) {
            violations.push(
                `entry ${i}: attrs must be a plain object, got ${Array.isArray(rawAttrs) ? "array" : typeof rawAttrs}`,
            );

            return;
        }

        const attrs = rawAttrs as Record<string, unknown>;
        const modelRules = MODEL_ATTRS[model];

        for (const [key, val] of Object.entries(attrs)) {
            // client_secret and other obvious secret fields are always denied
            if (
                key === "client_secret" ||
                key === "token" ||
                key === "password" ||
                key === "key_data"
            ) {
                violations.push(
                    `entry ${i}: secret field "${key}" must be omitted (auto-generated)`,
                );
                continue;
            }

            const rule = modelRules?.[key];

            if (rule === undefined) {
                // Attribute not in the allow-list for this model
                violations.push(
                    `entry ${i}: attribute "${key}" is not permitted for model "${model}"`,
                );
                continue;
            }

            switch (rule.bin) {
                case "pass":
                    // Always fine
                    break;

                case "flag":
                    flags.push({ entryIndex: i, model, attr: key, value: val });
                    break;

                case "force": {
                    // A forced attribute must be a plain untagged literal. The
                    // plain-JSON projection loses tags: an unresolved
                    // `!KeyOf <id>` projects to the bare string `<id>`, so a
                    // decoy entry whose `id` equals the forced literal would
                    // sail past the JSON comparison — yet at apply time
                    // authentik resolves the reference to a PK, NOT the safe
                    // forced value. Reject any tag BEFORE the JSON comparison.
                    const fnode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );

                    if (
                        isNode(fnode) &&
                        typeof fnode.tag === "string" &&
                        fnode.tag !== ""
                    ) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a plain untagged literal (a forced/capped attribute may not be a reference), got tag "${fnode.tag}"`,
                        );
                        break;
                    }

                    // Value must deep-equal the policy's required value
                    if (JSON.stringify(val) !== JSON.stringify(rule.value)) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be ${JSON.stringify(rule.value)} (policy-enforced), got ${JSON.stringify(val)}`,
                        );
                    }
                    break;
                }

                case "ref": {
                    // Relationship field: REQUIRE a permitted reference (curated
                    // !Find or in-blueprint !KeyOf), rejecting plain literals and
                    // non-permitted tags. The referenced target's curated-only
                    // restriction is enforced separately by the tag walk.
                    const refNode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );
                    const msg = checkRefAttr(refNode);

                    if (msg !== null) {
                        violations.push(
                            `entry ${i}: attribute "${key}" ${msg}`,
                        );
                    }
                    break;
                }

                case "cap": {
                    // Same soundness guard as `force`: a capped attribute must
                    // be a plain untagged literal, never a reference. The
                    // plain-JSON projection loses tags, so an unresolved tag
                    // could project to a value that passes the numeric cap yet
                    // resolves to something else entirely at apply time.
                    const cnode = attrValueNode(
                        pdoc.contents as Node | null,
                        i,
                        key,
                    );

                    if (
                        isNode(cnode) &&
                        typeof cnode.tag === "string" &&
                        cnode.tag !== ""
                    ) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a plain untagged literal (a forced/capped attribute may not be a reference), got tag "${cnode.tag}"`,
                        );
                        break;
                    }
                    // Value must be a non-negative number ≤ maxSeconds.
                    const maxSec = rule.maxSeconds ?? Infinity;
                    const num = parseTokenDuration(val);

                    if (num === null || num < 0 || num > maxSec) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be a non-negative value of at most ${maxSec}s`,
                        );
                    }
                    break;
                }
            }
        }
    });

    // --- Tagged reference checking: walk the full document AST ---
    // Default-deny on tags. Never throw on hostile/malformed input: any error
    // becomes a violation, never an exception.
    try {
        if (isNode(pdoc.contents)) {
            const { refs, violations: tagViolations } = collectTaggedRefs(
                pdoc.contents,
            );
            violations.push(...tagViolations);

            for (const ref of refs) {
                const msg = checkRef(ref, definedIDs);

                if (msg !== null) {
                    violations.push(msg);
                }
            }
        }
    } catch (err) {
        violations.push(
            `tag validation failed: ${(err as Error).message ?? String(err)}`,
        );
    }

    return { ok: violations.length === 0, violations, flags };
}

// #endregion
