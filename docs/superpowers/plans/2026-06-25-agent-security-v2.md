# Agent Security v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v1 blueprint validator into a policy-enforcement point that makes any IdP-security-surface change inexpressible, and add a credential-free "prepare to apply" handoff (trusted diff + undo snapshot + irreversible flagging + operator apply command) — with the MCP never holding an apply credential.

**Architecture:** Policy data is isolated in one module (`blueprint-policy.ts`); the validator (`blueprint-validate.ts`) enforces it; three handoff modules (`blueprint-diff.ts`, `blueprint-undo.ts`, `blueprint-prepare.ts`) build the operator handoff from read-only calls. A new `prepare_apply` MCP tool orchestrates validate→diff→undo→flag→command. No apply tool, no write/apply credential.

**Tech Stack:** TypeScript run natively by Node ≥24 (no build), `node --test`, `yaml` + `zod` (existing deps), `@modelcontextprotocol/sdk`. Package: `mcp-servers/code-mode`.

## Global Constraints

- Product name always lowercase **authentik**.
- All code in `mcp-servers/code-mode/lib/*.ts`; tests in `mcp-servers/code-mode/test/*.test.ts`; run from `mcp-servers/code-mode` with `node --test`.
- `#*` package imports; `.ts` relative-import extensions; no new npm deps.
- **Both `node --test` AND `npx tsc --noEmit` must pass** before each commit (type-stripping does not type-check; this package uses `noUncheckedIndexedAccess`).
- Commit directly to branch `agent-security-v2`; no Claude co-author trailer.
- **v2 invariant: the MCP holds no write/apply credential and exposes no apply tool.** It only ever reads (existing scoped read token) and emits artifacts for the operator.
- Spec: `docs/superpowers/specs/2026-06-25-agent-security-v2-design.md`. Verified identifiers (Phase 0) are in spec §3.3 / §5.

## File Structure

- `lib/blueprint-policy.ts` (new) — pure policy data: allowed models, per-model attribute rules (bins), curated built-in references, forced-default values, lifetime caps, excluded scopes. No logic beyond tiny lookups.
- `lib/blueprint-validate.ts` (rewrite of v1) — `validateBlueprint(content)` enforces the policy; returns `{ ok, violations, flags }`.
- `lib/blueprint-diff.ts` (new) — `computeDiff(blueprint, ak)` → trusted diff vs live state.
- `lib/blueprint-undo.ts` (new) — `buildUndoSnapshot(blueprint, ak)` → restore-point blueprint + reversibility classification.
- `lib/blueprint-prepare.ts` (new) — `prepareApply(content, ak)` → orchestrates validate+diff+undo+flag+command+honesty payload.
- `lib/tools.ts` / `lib/index.ts` (modify) — register `prepare_apply`; keep `validate_blueprint`; assert no apply path.
- `test/*.test.ts` per module; update `test/index.smoke.test.ts`.
- `mcp-servers/code-mode/README.md` (modify) — "Security (v2)" section.

---

### Task 1: Policy data module

**Files:**

- Create: `mcp-servers/code-mode/lib/blueprint-policy.ts`
- Test: `mcp-servers/code-mode/test/blueprint-policy.test.ts`
- Read for exact enum values: `/Users/teffen/Projects/authentik/authentik/providers/oauth2/api/providers.py` and `.../saml/api/providers.py` (forced-default enum values for `sub_mode`, `issuer_mode`; lifetime field names) — encode the verified literals; do not guess.

**Interfaces:**

- Produces: `ALLOWED_MODELS: ReadonlySet<string>`; `type AttrBin = "pass"|"flag"|"force"|"cap"`; `interface AttrRule { bin: AttrBin; value?: unknown; maxSeconds?: number }`; `MODEL_ATTRS: Readonly<Record<string, Readonly<Record<string, AttrRule>>>>`; `CURATED_REFS` (flows by slug, default key `!Find` target name, scope mappings by managed key); `EXCLUDED_SCOPES: ReadonlySet<string>`; `DESTRUCTIVE_MODEL_PREFIXES`/`isDestructiveEntry`.

- [ ] **Step 1: Confirm forced-default enum values** — read the two serializer files above; record the exact values for `sub_mode` (e.g. the hashed option), `issuer_mode`, and the lifetime field names (`access_code_validity`, `token_validity`, refresh). These literals are encoded in this module and nowhere else.

- [ ] **Step 2: Write the failing test** (`test/blueprint-policy.test.ts`)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ALLOWED_MODELS,
    MODEL_ATTRS,
    CURATED_REFS,
    EXCLUDED_SCOPES,
} from "#blueprint-policy";

test("only the three onboarding models are allowed", () => {
    assert.deepEqual([...ALLOWED_MODELS].sort(), [
        "authentik_core.application",
        "authentik_providers_oauth2.oauth2provider",
        "authentik_providers_saml.samlprovider",
    ]);
});

test("curated scopes include the standard four and EXCLUDE authentik_api", () => {
    const curated = CURATED_REFS.scopeMappings;
    assert.ok(curated.includes("goauthentik.io/providers/oauth2/scope-openid"));
    assert.ok(
        curated.includes(
            "goauthentik.io/providers/oauth2/scope-offline_access",
        ),
    );
    assert.ok(
        !curated.includes(
            "goauthentik.io/providers/oauth2/scope-authentik_api",
        ),
    );
    assert.ok(
        EXCLUDED_SCOPES.has(
            "goauthentik.io/providers/oauth2/scope-authentik_api",
        ),
    );
});

test("curated flow is explicit-consent, not implicit", () => {
    assert.ok(
        CURATED_REFS.flows.includes(
            "default-provider-authorization-explicit-consent",
        ),
    );
    assert.ok(!CURATED_REFS.flows.some((f) => f.includes("implicit-consent")));
});

test("oauth2 provider forces safe token-trust attrs and flags redirect_uris", () => {
    const a = MODEL_ATTRS["authentik_providers_oauth2.oauth2provider"];
    assert.equal(a.include_claims_in_id_token?.bin, "force");
    assert.equal(a.include_claims_in_id_token?.value, false);
    assert.equal(a.redirect_uris?.bin, "flag");
    assert.equal(a.issuer_mode?.bin, "force");
});
```

- [ ] **Step 3: Run test to verify it fails** — `node --test test/blueprint-policy.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** (`lib/blueprint-policy.ts`) — encode the data. Use the Step-1 verified enum literals where `???` appears:

```ts
/** @file Policy data for the blueprint validator (v2 policy-enforcement point). */

export type AttrBin = "pass" | "flag" | "force" | "cap";
export interface AttrRule {
    bin: AttrBin;
    value?: unknown; // for "force"
    maxSeconds?: number; // for "cap"
}

export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
    "authentik_core.application",
    "authentik_providers_oauth2.oauth2provider",
    "authentik_providers_saml.samlprovider",
]);

/** Only references resolving to these built-ins are permitted (spec §3.3). */
export const CURATED_REFS = {
    flows: [
        "default-provider-authorization-explicit-consent",
        "default-provider-invalidation-flow",
    ],
    defaultSigningKeyName: "authentik Self-signed Certificate",
    scopeMappings: [
        "goauthentik.io/providers/oauth2/scope-openid",
        "goauthentik.io/providers/oauth2/scope-email",
        "goauthentik.io/providers/oauth2/scope-profile",
        "goauthentik.io/providers/oauth2/scope-offline_access",
    ],
} as const;

export const EXCLUDED_SCOPES: ReadonlySet<string> = new Set([
    "goauthentik.io/providers/oauth2/scope-authentik_api",
    "goauthentik.io/providers/oauth2/scope-entitlements",
]);

const TOKEN_MAX = 60 * 60 * 24; // 24h cap; adjust to admin global max when that exists (v3)

export const MODEL_ATTRS: Readonly<
    Record<string, Readonly<Record<string, AttrRule>>>
> = {
    "authentik_core.application": {
        name: { bin: "pass" },
        slug: { bin: "pass" },
        group: { bin: "pass" },
        meta_launch_url: { bin: "pass" },
        meta_description: { bin: "pass" },
        meta_publisher: { bin: "pass" },
        meta_icon: { bin: "pass" },
        // `provider` reference + `policies` binding are handled by reference rules (validator).
    },
    "authentik_providers_oauth2.oauth2provider": {
        name: { bin: "pass" },
        client_type: { bin: "flag" },
        redirect_uris: { bin: "flag" },
        property_mappings: { bin: "flag" }, // references; constrained to curated scope mappings by the validator
        sub_mode: { bin: "force", value: "/* SUB_MODE from Step 1 */" },
        issuer_mode: { bin: "force", value: "/* ISSUER_MODE from Step 1 */" },
        include_claims_in_id_token: { bin: "force", value: false },
        access_code_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
        token_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
        // signing_key handled by reference rules (force to CURATED_REFS.defaultSigningKeyName)
    },
    "authentik_providers_saml.samlprovider": {
        name: { bin: "pass" },
        acs_url: { bin: "flag" },
        audience: { bin: "flag" },
        sp_binding: { bin: "flag" },
        // signing_kp / property_mappings handled by reference rules
    },
};

export const DESTRUCTIVE_MODEL_PREFIXES = [
    "authentik_crypto.",
    "authentik_sources_",
    "authentik_providers_",
];

/** A blueprint entry that deletes a source/provider or touches crypto is irreversible. */
export function isDestructiveEntry(
    model: string,
    state: string | undefined,
): boolean {
    if (state === "absent") return true;
    return model.startsWith("authentik_crypto.");
}
```

> Replace the two `/* … from Step 1 */` placeholders with the real enum literals before this step is complete — they must not survive into the committed file.

- [ ] **Step 5: Run test to verify it passes** — `node --test test/blueprint-policy.test.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit** — `git add lib/blueprint-policy.ts test/blueprint-policy.test.ts && git commit -m "feat(code-mode): v2 blueprint policy data (allow-lists, curated refs, bins)"`

---

### Task 2: Validator = policy-enforcement point

**Files:**

- Modify (rewrite): `mcp-servers/code-mode/lib/blueprint-validate.ts`
- Test: `mcp-servers/code-mode/test/blueprint-validate.test.ts` (expand)

**Interfaces:**

- Consumes: everything from `#blueprint-policy`.
- Produces: `interface BlueprintValidation { ok: boolean; violations: string[]; flags: FlagItem[] }` where `interface FlagItem { entryIndex: number; model: string; attr: string; value: unknown }`; `validateBlueprint(content: string): BlueprintValidation`.

- [ ] **Step 1: Write the failing tests** (`test/blueprint-validate.test.ts`) — cover every rule. Representative cases:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBlueprint } from "#blueprint-validate";

const oauthOK = `version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: grafana
      redirect_uris: ["https://grafana.company/oauth/callback"]`;

test("accepts an allowed provider and surfaces redirect_uris as a flag", () => {
    const r = validateBlueprint(oauthOK);
    assert.equal(r.ok, true);
    assert.ok(r.flags.some((f) => f.attr === "redirect_uris"));
});

test("rejects a non-allow-listed model", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_policies_expression.expressionpolicy
    attrs: {name: x, expression: "return True"}`);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /model .*expressionpolicy/);
});

test("rejects an attribute not in the model's allow-list", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs: {name: x, signing_key: anything}`);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /signing_key/);
});

test("rejects a forced attr set to the wrong value", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs: {name: x, include_claims_in_id_token: true}`);
    assert.equal(r.ok, false);
});

test("rejects creating a property mapping (expression)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.scopemapping
    attrs: {name: evil, scope_name: x, expression: "return token"}`);
    assert.equal(r.ok, false);
});

test("rejects a !Find reference to a non-curated scope (authentik_api)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-authentik_api]]`);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /authentik_api|not permitted/);
});

test("permits a !Find reference to a curated scope", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-openid]]`);
    assert.equal(r.ok, true);
});

test("rejects a policy binding", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs: {name: x, slug: x, policies: ["some-policy"]}`);
    assert.equal(r.ok, false);
});

test("rejects multi-document input", () => {
    const r = validateBlueprint(`version: 1
entries: []
---
version: 1
entries:
  - model: authentik_core.group
    attrs: {is_superuser: true}`);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /multi-document|single/i);
});

test("rejects non-object attrs", () => {
    assert.equal(
        validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs: "oops"`).ok,
        false,
    );
});

test("normalizes model case before allow-list lookup", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: AUTHENTIK_CORE.Application
    attrs: {name: x, slug: x}`);
    assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run tests to verify they fail** — `node --test test/blueprint-validate.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`lib/blueprint-validate.ts`) — full rewrite. Key logic (write complete code):
    - Detect multi-doc by scanning for a top-level `\n---` document separator (authentik uses single-doc `load`); if present → violation, return.
    - Parse with `yaml`'s `parse(content, { logLevel: "silent" })`. Wrap in try/catch → "unparseable" violation.
    - Require `entries` to be an array.
    - For each entry: case-normalize `model` (`.toLowerCase()`), check `ALLOWED_MODELS` (reject if absent). Require `attrs` is a plain object (reject non-object).
    - For each attr key in `attrs`: look up `MODEL_ATTRS[model][key]`. If absent → BLOCK violation ("attribute not permitted"). Else by bin: `force` → value must deep-equal rule.value else violation; `cap` → numeric ≤ maxSeconds else violation; `flag` → push to `flags`; `pass` → ok.
    - Reference handling: walk attr values for authentik tag nodes (`!Find`/`!KeyOf` — `yaml` represents unresolved tags; detect via the parsed node's `tag` or a raw-text pre-scan). A `!Find`/`!KeyOf` is permitted ONLY if it targets a curated ref: a flow in `CURATED_REFS.flows`, the default key by name, or a scope mapping in `CURATED_REFS.scopeMappings`. Any other external reference → BLOCK. (Implementation note: easiest robust approach is a raw-text scan combined with the parsed structure — extract every `!Find`/`!KeyOf [...]` and check its target literal against the curated lists; reject if it names `managed`/`slug`/`name` values not in the curated set.)
    - `policies` / any relationship attr not in the model's allow-list is already BLOCKed by the per-attr allow-list (it won't be a listed key) — keep an explicit test (above) so this stays true.
    - Return `{ ok: violations.length === 0, violations, flags }`.

- [ ] **Step 4: Run tests to verify they pass** — `node --test test/blueprint-validate.test.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(code-mode): validator as policy-enforcement point (allow-lists, curated refs, multi-doc reject)"`

---

### Task 3: Trusted diff

**Files:**

- Create: `lib/blueprint-diff.ts`; Test: `test/blueprint-diff.test.ts`

**Interfaces:**

- Consumes: an `Ak` read client (`#client`, `ak.request("GET", ...)`).
- Produces: `interface DiffObject { model: string; identifier: string; status: "create"|"update"|"unchanged"; changedFields?: Record<string,{from:unknown;to:unknown}>; unexpected?: boolean }`; `interface BlueprintDiff { objects: DiffObject[] }`; `computeDiff(entries: ParsedEntry[], ak: Ak): Promise<BlueprintDiff>`.

- [ ] **Step 1: Write the failing test** (mock `ak`) — assert: a new object → `create`; an existing object whose field changes → `update` with `changedFields`; the FULL object list is returned (one `DiffObject` per entry, none omitted) so a snuck-in object is always present.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiff } from "#blueprint-diff";

const ak = {
    request: async (_m: string, path: string) => {
        if (path.includes("/applications/"))
            return {
                status: 200,
                data: { results: [{ slug: "grafana", name: "Old" }] },
            };
        return { status: 200, data: { results: [] } };
    },
};

test("diff returns one object per entry, marks create vs update", async () => {
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New" },
        },
        {
            model: "authentik_core.application",
            identifiers: { slug: "brandnew" },
            attrs: { name: "Brand New" },
        },
    ];
    const d = await computeDiff(entries as any, ak as any);
    assert.equal(d.objects.length, 2); // full list, nothing hidden
    const g = d.objects.find((o) => o.identifier.includes("grafana"));
    assert.equal(g?.status, "update");
    assert.deepEqual(g?.changedFields?.name, { from: "Old", to: "New" });
});
```

- [ ] **Step 2-4:** Run→fail; implement `computeDiff` (for each entry: GET the model's list filtered by identifier via read calls; if found → compare attrs → `update`/`unchanged` with `changedFields`; else `create`; always emit a `DiffObject`); run→pass; `tsc` clean.

- [ ] **Step 5: Integration check** — against the live dev instance (start `make run` in `/Users/teffen/Projects/authentik`, `AUTHENTIK_URL=http://localhost:9000` + scoped read token from `.env`): run `computeDiff` on a blueprint that updates an existing application and creates a new one; confirm statuses/changedFields match reality.

- [ ] **Step 6: Commit** — `git commit -m "feat(code-mode): trusted server-computed blueprint diff"`

---

### Task 4: Undo snapshot + reversibility classification

**Files:**

- Create: `lib/blueprint-undo.ts`; Test: `test/blueprint-undo.test.ts`

**Interfaces:**

- Produces: `type Reversibility = "clean"|"lossy"|"impossible"`; `interface UndoSnapshot { blueprint: string; reversibility: Reversibility; notes: string[] }`; `buildUndoSnapshot(entries: ParsedEntry[], ak: Ak): Promise<UndoSnapshot>`.

- [ ] **Step 1: Write the failing test** (mock `ak`): an update to an existing object → `clean`, snapshot YAML contains the object's CURRENT state; a `state: absent` (delete) entry → `impossible` with a note; a create-only entry → reversible by deletion noted as `lossy` (recreate churns UUID).

```ts
test("undo snapshot captures current state for updates (clean)", async () => {
    const ak = {
        request: async () => ({
            status: 200,
            data: { results: [{ slug: "grafana", name: "Old" }] },
        }),
    };
    const entries = [
        {
            model: "authentik_core.application",
            identifiers: { slug: "grafana" },
            attrs: { name: "New" },
        },
    ];
    const u = await buildUndoSnapshot(entries as any, ak as any);
    assert.equal(u.reversibility, "clean");
    assert.match(u.blueprint, /name: Old/);
});

test("delete entries are classified impossible", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const entries = [
        {
            model: "authentik_sources_oauth.oauthsource",
            state: "absent",
            identifiers: { slug: "x" },
        },
    ];
    const u = await buildUndoSnapshot(entries as any, ak as any);
    assert.equal(u.reversibility, "impossible");
    assert.ok(u.notes.some((n) => /cannot be undone|external/i.test(n)));
});
```

- [ ] **Step 2-4:** Run→fail; implement (read current state of each entry's object; emit a restore blueprint of those current states; classify: any `state: absent` or crypto → `impossible`; create-only → `lossy`; pure attr update of existing → `clean`); run→pass; `tsc` clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(code-mode): undo snapshot + reversibility classification"`

---

### Task 5: Prepare-apply orchestrator (irreversible flag + handoff)

**Files:**

- Create: `lib/blueprint-prepare.ts`; Test: `test/blueprint-prepare.test.ts`

**Interfaces:**

- Consumes: `validateBlueprint` (#blueprint-validate), `computeDiff` (#blueprint-diff), `buildUndoSnapshot` (#blueprint-undo), `isDestructiveEntry` (#blueprint-policy), an `Ak` read client.
- Produces: `interface PrepareResult { ok: boolean; violations: string[]; flags: FlagItem[]; diff?: BlueprintDiff; undo?: UndoSnapshot; destructive: boolean; applyCommand: string; notice: string }`; `prepareApply(content: string, ak: Ak): Promise<PrepareResult>`.

- [ ] **Step 1: Write the failing test:** invalid blueprint → `{ ok:false, violations }` and NO diff/undo/applyCommand (don't prepare an invalid thing); valid non-destructive → ok with diff+undo+flags, `applyCommand` is `ak apply_blueprint <file>`, `destructive:false`, `notice` contains the "you remain responsible / this tool will not apply" honesty text; valid-but-destructive entry → `destructive:true` and `notice`/applyCommand steer to the manual host-CLI path.

```ts
test("invalid blueprint returns violations and no apply artifacts", async () => {
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_policies_expression.expressionpolicy
    attrs: {name: x}`,
        {
            request: async () => ({ status: 200, data: { results: [] } }),
        } as any,
    );
    assert.equal(r.ok, false);
    assert.equal(r.diff, undefined);
    assert.equal(r.applyCommand, "");
});

test("valid blueprint yields diff+undo+honest notice, never auto-applies", async () => {
    const ak = {
        request: async () => ({ status: 200, data: { results: [] } }),
    };
    const r = await prepareApply(
        `version: 1
entries:
  - model: authentik_core.application
    attrs: {name: Grafana, slug: grafana}`,
        ak as any,
    );
    assert.equal(r.ok, true);
    assert.ok(r.diff && r.undo);
    assert.match(r.applyCommand, /ak apply_blueprint/);
    assert.match(r.notice, /will not apply|you remain responsible/i);
});
```

- [ ] **Step 2-4:** Run→fail; implement (validate first; if not ok return early with no artifacts; else compute diff + undo; compute `destructive = entries.some(e => isDestructiveEntry(...))`; build `applyCommand` and `notice`; destructive → notice steers to manual host-CLI and omits the smooth command); run→pass; `tsc` clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(code-mode): prepare-apply orchestrator (credential-free handoff)"`

---

### Task 6: Wire the `prepare_apply` tool; assert no apply credential

**Files:**

- Modify: `lib/tools.ts`, `lib/index.ts`; Test: `test/tools.test.ts`, `test/index.smoke.test.ts`

**Interfaces:**

- Consumes: `prepareApply`. Produces: `createTools(...)` returns `{ search, execute, validate, prepare }`; MCP tools = `search`, `execute`, `validate_blueprint`, `prepare_apply`, `docs`.

- [ ] **Step 1: Write/extend tests:** `tools.test.ts` asserts `tools.prepare` exists and calls through to a read-only `ak`; `index.smoke.test.ts` asserts tools/list includes `prepare_apply` and that NO tool name matches `/apply_write|execute_write|write/` and the server still constructs its `ak` read-only (no write/apply token env consumed).

- [ ] **Step 2-4:** Run→fail; implement: in `tools.ts` add `const prepare = ({ content }) => prepareApply(content, createAk(config, { allowWrites: false }))` and return it; in `index.ts` register the `prepare_apply` tool (`{ content: z.string() }`, description: "Validate a proposed blueprint and PREPARE it for the operator to apply: returns a trusted diff, an undo snapshot, irreversible-op flags, and the exact `ak apply_blueprint` command. This server never applies changes itself."). Run→pass (full suite); `tsc` clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(code-mode): prepare_apply tool (propose-only, no apply credential)"`

---

### Task 7: Docs

**Files:** Modify `mcp-servers/code-mode/README.md`.

- [ ] **Step 1:** Update the "Security (v1)" section to "Security (v2)": tools now `search`, `execute`, `validate_blueprint`, `prepare_apply`, `docs`; explain the validator is a policy-enforcement point (allow-list models/attrs, curated built-in refs, no expressions); explain `prepare_apply` is credential-free (diff + undo + flags + `ak apply_blueprint` command; the operator applies; the MCP never holds an apply credential). Link the spec. Keep it accurate to what shipped (no Trust-Policy registry / no automated apply — note those as v3).
- [ ] **Step 2:** `node --test` + `npx tsc --noEmit` → green. Commit: `git commit -m "docs(code-mode): document v2 policy-enforcement validator + prepare_apply"`.

---

## Self-Review

**Spec coverage:** §3.1 model allow-list → T1/T2; §3.2 attribute bins → T1 (data) + T2 (enforcement); §3.3 curated refs incl. authentik_api exclusion → T1/T2; §3.4 multi-doc-reject/non-object-attrs/case-normalize/!Find-constraint → T2; §4 diff → T3, undo → T4, irreversible-flag + apply command + honesty → T5; "MCP never holds apply credential / no apply tool" → T6; docs → T7. v3 items (Trust-Policy, automated apply) correctly excluded.

**Placeholder scan:** the only intentional fill-ins are the two `sub_mode`/`issuer_mode` enum literals (T1 Step 1 derives them from the serializer; flagged to not survive as comments). No logic placeholders.

**Type consistency:** `BlueprintValidation { ok, violations, flags }` + `FlagItem` defined T2, consumed T5/T6; `Ak` read client (`{ allowWrites: false }`) consistent across T3/T4/T5/T6; `computeDiff(entries, ak)` / `buildUndoSnapshot(entries, ak)` / `prepareApply(content, ak)` signatures consistent; `isDestructiveEntry` defined T1, used T5.
