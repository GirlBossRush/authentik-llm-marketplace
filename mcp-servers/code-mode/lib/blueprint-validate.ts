/** @file Validate a proposed authentik Blueprint without applying it (v2 policy-enforcement point). */

import { parseDocument, isMap, isSeq, isPair, isScalar, type Document, type Node, type YAMLSeq, type Scalar } from "yaml";

import {
    ALLOWED_MODELS,
    MODEL_ATTRS,
    CURATED_REFS,
    EXCLUDED_SCOPES,
} from "#blueprint-policy";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reference checking helpers
// ---------------------------------------------------------------------------

/**
 * Walk a yaml.js Document AST and collect all !Find / !KeyOf tagged nodes.
 * Returns each as a record of { tag, targetValue } where targetValue is the
 * second element of a !Find sequence (the [field, value] pair's value string),
 * or the scalar value for !KeyOf.
 *
 * Note: yaml v2 uses .items on both YAMLMap (containing Pair objects) and
 * YAMLSeq (containing child nodes). Use the isMap/isSeq/isPair helpers to
 * distinguish them — do NOT check for a "pairs" property (it doesn't exist).
 */
interface TaggedRef {
    tag: string;
    /** The resolved target string (scope slug, flow slug, or signing-key name). */
    targetValue: string;
}

function collectTaggedRefs(node: Node | null | undefined): TaggedRef[] {
    if (node == null) return [];
    const results: TaggedRef[] = [];

    function walk(n: Node | null | undefined): void {
        if (n == null) return;

        if (n.tag === "!Find") {
            // !Find [modelName, [fieldName, targetValue]]
            const seq = n as YAMLSeq;
            const inner = seq.items[1];
            if (inner != null && isSeq(inner)) {
                const valNode = (inner as YAMLSeq).items[1];
                if (valNode != null && isScalar(valNode)) {
                    const s = valNode as Scalar;
                    if (typeof s.value === "string") {
                        results.push({ tag: "!Find", targetValue: s.value });
                    }
                }
            }
        } else if (n.tag === "!KeyOf") {
            const sc = n as Scalar;
            if (typeof sc.value === "string") {
                results.push({ tag: "!KeyOf", targetValue: sc.value });
            }
        }

        // Recurse: YAMLMap.items contains Pair objects (key+value)
        if (isMap(n)) {
            for (const pair of n.items) {
                walk(pair.key as Node);
                walk(pair.value as Node);
            }
        }
        // Recurse: YAMLSeq.items contains child nodes
        if (isSeq(n)) {
            for (const item of n.items) {
                walk(item as Node);
            }
        }
        // Recurse: bare Pair (shouldn't appear at top level but handle defensively)
        if (isPair(n)) {
            walk(n.key as Node);
            walk(n.value as Node);
        }
    }

    walk(node);
    return results;
}

/**
 * Return a violation message if a tagged reference is not curated, or null if
 * it is permitted.
 */
function checkRef(ref: TaggedRef): string | null {
    const { targetValue } = ref;

    // Curated scope mappings (managed field values)
    if (CURATED_REFS.scopeMappings.includes(targetValue as never)) {
        return null;
    }

    // Excluded scopes are explicitly blocked
    if (EXCLUDED_SCOPES.has(targetValue)) {
        return `external reference "${targetValue}" is not permitted (excluded scope)`;
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

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

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

    // --- Collect all tagged refs from the whole document once ---
    // We'll also check per-entry attrs for !Find/!KeyOf nodes.

    entries.forEach((entry: unknown, i: number) => {
        const raw = entry as Record<string, unknown>;

        const rawModel = typeof raw?.["model"] === "string" ? raw["model"] : "";
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
        const rawAttrs = raw["attrs"];
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
                    // Value must deep-equal the policy's required value
                    if (JSON.stringify(val) !== JSON.stringify(rule.value)) {
                        violations.push(
                            `entry ${i}: attribute "${key}" must be ${JSON.stringify(rule.value)} (policy-enforced), got ${JSON.stringify(val)}`,
                        );
                    }
                    break;
                }

                case "cap": {
                    // Value must be a number ≤ maxSeconds
                    const maxSec = rule.maxSeconds ?? Infinity;
                    const num = parseTokenDuration(val);
                    if (num === null || num > maxSec) {
                        violations.push(
                            `entry ${i}: attribute "${key}" exceeds the maximum allowed value of ${maxSec}s`,
                        );
                    }
                    break;
                }
            }
        }
    });

    // --- Tagged reference checking: walk the full document AST ---
    if (pdoc.contents != null) {
        const refs = collectTaggedRefs(pdoc.contents as Node);
        for (const ref of refs) {
            const msg = checkRef(ref);
            if (msg !== null) {
                violations.push(msg);
            }
        }
    }

    return { ok: violations.length === 0, violations, flags };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

        // Parse "key=value;key=value" style
        let total = 0;
        let parsed = false;
        for (const part of val.split(";")) {
            const kv = /^\s*(\w+)\s*=\s*(\d+)\s*$/.exec(part.trim());
            if (!kv) continue;
            const [, unit, amount] = kv;
            parsed = true;
            const n = parseInt(amount!, 10);
            switch (unit) {
                case "seconds": total += n; break;
                case "minutes": total += n * 60; break;
                case "hours":   total += n * 3600; break;
                case "days":    total += n * 86400; break;
                case "weeks":   total += n * 604800; break;
            }
        }
        return parsed ? total : null;
    }
    return null;
}
