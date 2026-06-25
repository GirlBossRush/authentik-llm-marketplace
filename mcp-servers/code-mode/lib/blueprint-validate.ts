/** @file Validate a proposed authentik Blueprint without applying it. */

import { parse } from "yaml";

/** Models an agent blueprint may never touch (identity fabric + secrets). */
const DENIED_MODELS = new Set([
    "authentik_core.token",
    "authentik_core.user",
    "authentik_core.group",
    "authentik_rbac.role",
]);
/** Whole app-labels that are off-limits regardless of model. */
const DENIED_PREFIXES = ["authentik_crypto."];
/** Attr keys whose presence means the agent is planting a known secret. */
const SECRET_FIELDS = new Set(["client_secret", "token", "password", "key_data", "signing_key"]);

export interface BlueprintValidation {
    ok: boolean;
    violations: string[];
}

export function validateBlueprint(content: string): BlueprintValidation {
    const violations: string[] = [];
    if (/!Env\b/.test(content)) {
        violations.push("forbidden tag !Env (can read environment/secrets)");
    }

    let doc: unknown;
    try {
        doc = parse(content, { logLevel: "silent" });
    } catch (err) {
        return { ok: false, violations: [`unparseable YAML: ${(err as Error).message}`] };
    }

    const entries = (doc as { entries?: unknown })?.entries;
    if (!Array.isArray(entries)) {
        violations.push("blueprint has no `entries` list");
        return { ok: false, violations };
    }

    entries.forEach((entry, i) => {
        const model = typeof entry?.model === "string" ? entry.model : "";
        if (!model) {
            violations.push(`entry ${i}: missing model`);
            return;
        }
        if (DENIED_MODELS.has(model) || DENIED_PREFIXES.some((p) => model.startsWith(p))) {
            violations.push(`entry ${i}: denied model "${model}"`);
        }
        const attrs = (entry?.attrs ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(attrs)) {
            if (SECRET_FIELDS.has(key)) {
                violations.push(`entry ${i}: secret field "${key}" must be omitted (auto-generated)`);
            }
        }
    });

    return { ok: violations.length === 0, violations };
}
