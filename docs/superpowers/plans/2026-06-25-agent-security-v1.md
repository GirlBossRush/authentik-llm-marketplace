# Agent Security v1 ("Safe read, safe propose") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authentik code-mode MCP structurally incapable of mutating an instance: it reads through a least-privilege token (no secret-reveal perms), and can only _propose_ changes as validated blueprints — never apply them.

**Architecture:** Three independent pieces. (1) A bootstrap script the admin runs once to provision a scoped read-only `ak-agent` service account + token. (2) MCP read hardening: default the instance URL, and block secret-reveal endpoints at the client layer as defense-in-depth. (3) Replace the `execute_write` (apply) tool with a `validate_blueprint` tool that parses a proposed blueprint and rejects denied models / `!Env` / secret fields without touching the instance.

**Tech Stack:** TypeScript run natively by Node ≥24 (no build step), `node --test`, `yaml` + `zod` (already deps), `@modelcontextprotocol/sdk`. Bootstrap script is Python run via authentik's `ak shell`.

## Global Constraints

- Product name is always lowercase **authentik** (code, comments, copy).
- All MCP code lives in `mcp-servers/code-mode/lib/*.ts`; tests in `mcp-servers/code-mode/test/*.test.ts`; run from `mcp-servers/code-mode` with `node --test`.
- Imports use the package `#*` map (`import { x } from "#module"`) and `.ts` extensions for relative imports.
- No new npm dependencies (`yaml`, `zod`, `@modelcontextprotocol/sdk` only).
- v1 has **no mutation path**: `execute_write` is removed, nothing applies blueprints.
- Read allow-list rule: grant `view_*` permissions EXCEPT any codename ending in `_key` (secret-reveal) or `token` (token-object views). Verbatim from the security model doc §5/§7.
- Blueprint deny-list (validator): models `authentik_core.token|user|group`, `authentik_rbac.role`, any `authentik_crypto.*`; the `!Env` tag; secret attr fields. From doc §8.
- Default `AUTHENTIK_URL` to `http://localhost:9000`; never default `AUTHENTIK_TOKEN`.
- Reference: `docs/agent-security-model.md` (the spec).

---

### Task 1: Default `AUTHENTIK_URL`

**Files:**

- Modify: `mcp-servers/code-mode/lib/config.ts`
- Test: `mcp-servers/code-mode/test/config.test.ts`

**Interfaces:**

- Produces: `loadConfig(env)` unchanged signature; returns `baseURL` defaulting to `http://localhost:9000` when `AUTHENTIK_URL` is unset/blank. Token still required.

- [ ] **Step 1: Write the failing test** (append to `test/config.test.ts`)

```ts
test("loadConfig defaults AUTHENTIK_URL to localhost:9000 when unset", () => {
    const cfg = loadConfig({ AUTHENTIK_TOKEN: "t" });
    assert.equal(cfg.baseURL, "http://localhost:9000");
    assert.equal(cfg.token, "t");
});

test("loadConfig still requires a token", () => {
    assert.throws(
        () => loadConfig({ AUTHENTIK_URL: "http://localhost:9000" }),
        /AUTHENTIK_TOKEN/,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.ts`
Expected: FAIL — the default test throws "AUTHENTIK_URL is required".

- [ ] **Step 3: Implement** — in `lib/config.ts`, replace the URL handling:

```ts
const DEFAULT_URL = "http://localhost:9000";

export function loadConfig(env: Record<string, string | undefined>): AKConfig {
    const url = env.AUTHENTIK_URL?.trim() || DEFAULT_URL;
    const token = env.AUTHENTIK_TOKEN?.trim();
    if (!token)
        throw new Error("AUTHENTIK_TOKEN is required (an authentik API token)");
    return { baseURL: url.replace(/\/+$/, ""), token };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.ts`
Expected: PASS (all config tests).

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/code-mode/lib/config.ts mcp-servers/code-mode/test/config.test.ts
git commit -m "feat(code-mode): default AUTHENTIK_URL to localhost:9000"
```

---

### Task 2: Block secret-reveal endpoints at the client layer

**Files:**

- Modify: `mcp-servers/code-mode/lib/client.ts`
- Test: `mcp-servers/code-mode/test/client.test.ts`

**Interfaces:**

- Produces: `isSecretRevealPath(path: string): boolean` (exported). `ak.request` throws before any fetch when the path is a secret-reveal endpoint (`…/view_key/`, `…/view_private_key/`), even for reads — defense in depth behind the scoped token.

- [ ] **Step 1: Write the failing test** (append to `test/client.test.ts`)

```ts
import { createAk, isSecretRevealPath } from "#client";

test("isSecretRevealPath flags token/key reveal endpoints, not normal reads", () => {
    assert.equal(isSecretRevealPath("/core/tokens/abc/view_key/"), true);
    assert.equal(
        isSecretRevealPath("/crypto/certificatekeypairs/x/view_private_key/"),
        true,
    );
    assert.equal(isSecretRevealPath("/core/applications/"), false);
});

test("ak.request refuses secret-reveal paths before any network call", async () => {
    const ak = createAk(
        { baseURL: "http://127.0.0.1:1", token: "t" },
        { allowWrites: false },
    );
    await assert.rejects(
        () => ak.request("GET", "/core/tokens/abc/view_key/"),
        /secret-reveal/,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/client.test.ts`
Expected: FAIL — `isSecretRevealPath` is not exported.

- [ ] **Step 3: Implement** — in `lib/client.ts`, add the helper and the guard at the top of `request`:

```ts
const SECRET_REVEAL = /\/(view_key|view_private_key)\/?$/;

/** Endpoints that return a secret value (token key, private key). Blocked even for reads. */
export function isSecretRevealPath(path: string): boolean {
    return SECRET_REVEAL.test(path.split("?")[0]);
}
```

Then, inside `request`, before the existing `allowWrites` check:

```ts
if (isSecretRevealPath(path)) {
    throw new Error(`secret-reveal endpoint blocked: ${path}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/code-mode/lib/client.ts mcp-servers/code-mode/test/client.test.ts
git commit -m "feat(code-mode): block secret-reveal endpoints in ak.request (defense in depth)"
```

---

### Task 3: Blueprint content validator

**Files:**

- Create: `mcp-servers/code-mode/lib/blueprint-validate.ts`
- Test: `mcp-servers/code-mode/test/blueprint-validate.test.ts`

**Interfaces:**

- Produces: `validateBlueprint(content: string): { ok: boolean; violations: string[] }`. Pure function, no I/O. Rejects denied models, the `!Env` tag, secret attr fields, and unparseable / entry-less documents.

- [ ] **Step 1: Write the failing test** (`test/blueprint-validate.test.ts`)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateBlueprint } from "#blueprint-validate";

const APP = `version: 1
metadata: {name: ok}
entries:
  - model: authentik_core.application
    identifiers: {slug: my-app}
    attrs: {name: My App}`;

test("accepts an application-only blueprint", () => {
    assert.deepEqual(validateBlueprint(APP), { ok: true, violations: [] });
});

test("rejects a superuser group (denied model)", () => {
    const bp = `version: 1
entries:
  - model: authentik_core.group
    attrs: {is_superuser: true}`;
    const r = validateBlueprint(bp);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /denied model "authentik_core.group"/);
});

test("rejects token, role, and crypto models", () => {
    for (const m of [
        "authentik_core.token",
        "authentik_rbac.role",
        "authentik_crypto.certificatekeypair",
    ]) {
        const r = validateBlueprint(
            `version: 1\nentries:\n  - model: ${m}\n    attrs: {}`,
        );
        assert.equal(r.ok, false, `${m} should be denied`);
    }
});

test("rejects the !Env tag", () => {
    const bp = `version: 1
entries:
  - model: authentik_core.application
    attrs: {name: !Env SECRET}`;
    assert.match(validateBlueprint(bp).violations.join(" "), /!Env/);
});

test("rejects explicit secret fields", () => {
    const bp = `version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs: {name: p, client_secret: hunter2}`;
    assert.match(
        validateBlueprint(bp).violations.join(" "),
        /secret field "client_secret"/,
    );
});

test("rejects documents with no entries list", () => {
    assert.equal(
        validateBlueprint("version: 1\nmetadata: {name: x}").ok,
        false,
    );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blueprint-validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`lib/blueprint-validate.ts`)

```ts
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
const SECRET_FIELDS = new Set([
    "client_secret",
    "token",
    "password",
    "key_data",
    "signing_key",
]);

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
        return {
            ok: false,
            violations: [`unparseable YAML: ${(err as Error).message}`],
        };
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
        if (
            DENIED_MODELS.has(model) ||
            DENIED_PREFIXES.some((p) => model.startsWith(p))
        ) {
            violations.push(`entry ${i}: denied model "${model}"`);
        }

        const attrs = (entry?.attrs ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(attrs)) {
            if (SECRET_FIELDS.has(key)) {
                violations.push(
                    `entry ${i}: secret field "${key}" must be omitted (auto-generated)`,
                );
            }
        }
    });

    return { ok: violations.length === 0, violations };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/blueprint-validate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/code-mode/lib/blueprint-validate.ts mcp-servers/code-mode/test/blueprint-validate.test.ts
git commit -m "feat(code-mode): blueprint content validator (deny models/!Env/secrets)"
```

---

### Task 4: Swap `execute_write` for `validate_blueprint`

**Files:**

- Modify: `mcp-servers/code-mode/lib/tools.ts`
- Modify: `mcp-servers/code-mode/lib/index.ts`
- Test: `mcp-servers/code-mode/test/tools.test.ts`, `mcp-servers/code-mode/test/index.smoke.test.ts`

**Interfaces:**

- Consumes: `validateBlueprint` from Task 3.
- Produces: `createTools(...)` returns `{ search, execute, validate }` (no `executeWrite`/`confirmTokenFor`). MCP exposes tools `search`, `execute`, `validate_blueprint`, `docs` — and NOT `execute_write`.

- [ ] **Step 1: Write the failing test** (append to `test/tools.test.ts`)

```ts
test("tools expose validate and no longer expose executeWrite", () => {
    const spec = {
        openapi: "3.0.3",
        info: { version: "1" },
        paths: {},
        components: {},
    };
    const tools = createTools({
        spec,
        config: { baseURL: "http://x", token: "t" },
    });
    assert.equal(typeof tools.validate, "function");
    assert.equal("executeWrite" in tools, false);
    assert.equal(
        tools.validate({ content: "version: 1\nentries: []" }).ok,
        true,
    );
});
```

(Update the smoke test in `test/index.smoke.test.ts`: replace `assert.match(out, /"execute_write"/);` with `assert.match(out, /"validate_blueprint"/);` and add `assert.doesNotMatch(out, /"execute_write"/);`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tools.test.ts test/index.smoke.test.ts`
Expected: FAIL — `tools.validate` undefined; smoke still advertises `execute_write`.

- [ ] **Step 3: Implement — `lib/tools.ts`**

Remove the `import { createHash } from "node:crypto";` line, the `WriteConfirmation` interface, the `confirmTokenFor` function, and the entire `executeWrite` function. Add the import and the validate tool:

```ts
import {
    validateBlueprint,
    type BlueprintValidation,
} from "./blueprint-validate.ts";
```

Inside `createTools`, after `execute`:

```ts
const validate = ({ content }: { content: string }): BlueprintValidation =>
    validateBlueprint(content);
```

Change the return to:

```ts
return { search, execute, validate };
```

- [ ] **Step 4: Implement — `lib/index.ts`**

Delete the entire `tool<{ code: string; confirm?: string }>("execute_write", …)` registration block. Add, after the `execute` registration:

```ts
tool<{ content: string }>(
    "validate_blueprint",
    "Validate a proposed authentik Blueprint (YAML) WITHOUT applying it. Returns {ok, violations}. This server is propose-only: it never mutates the instance. Rejects denied models (tokens, users, groups, roles, crypto), the !Env tag, and explicit secret fields. Hand the operator the validated blueprint to apply themselves.",
    { content: z.string() },
    async (args) => asContent(tools.validate(args)),
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (whole suite, including the updated smoke test).

- [ ] **Step 6: Commit**

```bash
git add mcp-servers/code-mode/lib/tools.ts mcp-servers/code-mode/lib/index.ts mcp-servers/code-mode/test/tools.test.ts mcp-servers/code-mode/test/index.smoke.test.ts
git commit -m "feat(code-mode): replace execute_write with propose-only validate_blueprint"
```

---

### Task 5: Bootstrap script — provision a scoped read-only agent identity

**Files:**

- Create: `mcp-servers/code-mode/scripts/provision-agent-identity.py`
- Verify against the live dev instance (integration check; no unit test — it runs in authentik's Django shell).

**Interfaces:**

- Produces: a service account `ak-agent`, role `ak-agent-read` (view perms minus `*_key`/`*token`), group `ak-agent-grp`, and a non-expiring API token printed as `AUTHENTIK_READ_TOKEN=<key>`. That key is what the operator sets as the MCP's `AUTHENTIK_TOKEN`.

- [ ] **Step 1: Write the script** (`mcp-servers/code-mode/scripts/provision-agent-identity.py`)

```python
"""Provision a least-privilege read-only agent identity in authentik.

Run from the authentik checkout:  uv run ak shell < <path>/provision-agent-identity.py
Prints AUTHENTIK_READ_TOKEN=<key>; set that as the code-mode MCP's AUTHENTIK_TOKEN.
"""

from django.contrib.auth.models import Permission

from authentik.core.models import Group, Token, TokenIntents, User, UserTypes
from authentik.rbac.models import Role

ROLE, SA, GRP, TOK = "ak-agent-read", "ak-agent", "ak-agent-grp", "ak-agent-read-tok"

role, _ = Role.objects.update_or_create(name=ROLE)

# Allow-list: every view_* permission EXCEPT secret-reveal (codename ends "_key")
# and token-object views (codename ends "token"). See agent-security-model.md §5/§7.
codes = [
    f"{p.content_type.app_label}.{p.codename}"
    for p in Permission.objects.filter(codename__startswith="view_")
    if not (p.codename.endswith("_key") or p.codename.endswith("token"))
]
role.assign_perms(codes)

sa, _ = User.objects.update_or_create(
    username=SA, defaults=dict(name="authentik agent (read-only)", type=UserTypes.SERVICE_ACCOUNT)
)
grp, _ = Group.objects.update_or_create(name=GRP)
grp.roles.add(role)
sa.ak_groups.add(grp)

Token.objects.filter(user=sa, identifier=TOK).delete()
t = Token.objects.create(
    user=sa, identifier=TOK, intent=TokenIntents.INTENT_API, expiring=False,
    description="code-mode read-only agent token",
)
print(f"granted {len(codes)} view perms (excluded *_key and *token)")
print("AUTHENTIK_READ_TOKEN=" + t.key)
```

- [ ] **Step 2: Run the bootstrap against the live dev instance**

Run (from `/Users/teffen/Projects/authentik`):

```bash
uv run ak shell < mcp-servers/.../provision-agent-identity.py 2>/dev/null | tee /tmp/prov.out
```

Expected: prints `granted N view perms …` and `AUTHENTIK_READ_TOKEN=…`.

- [ ] **Step 3: Verify least privilege (the real test)**

```bash
RT=$(grep AUTHENTIK_READ_TOKEN= /tmp/prov.out | sed 's/.*=//')
B=http://localhost:9000/api/v3
echo "apps (expect 200):       $(curl -s -o /dev/null -w '%{http_code}' "$B/core/applications/" -H "Authorization: Bearer $RT")"
TID=$(curl -s "$B/core/tokens/?page_size=1" -H "Authorization: Bearer $RT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["results"][0]["identifier"])')
echo "own view_key (expect 403): $(curl -s -o /dev/null -w '%{http_code}' "$B/core/tokens/$TID/view_key/" -H "Authorization: Bearer $RT")"
KP=$(curl -s "$B/crypto/certificatekeypairs/?page_size=1" -H "Authorization: Bearer $RT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["results"][0]["pk"])')
echo "private key (expect 403):  $(curl -s -o /dev/null -w '%{http_code}' "$B/crypto/certificatekeypairs/$KP/view_private_key/" -H "Authorization: Bearer $RT")"
```

Expected: `200`, `403`, `403`. If any reveal returns `200`, the allow-list rule is wrong — STOP and fix before committing.

- [ ] **Step 4: Commit**

```bash
git add mcp-servers/code-mode/scripts/provision-agent-identity.py
git commit -m "feat(code-mode): bootstrap script for a scoped read-only agent identity"
```

---

### Task 6: Wire it up — `.mcp.json`, `.env` example, README

**Files:**

- Modify: `.mcp.json` (if it pins env), `mcp-servers/code-mode/README.md` (create if absent), `mcp-servers/code-mode/.env.example` (create)

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Add `.env.example`** (`mcp-servers/code-mode/.env.example`)

```bash
# authentik instance the agent reads. Defaults to http://localhost:9000 if unset.
AUTHENTIK_URL=http://localhost:9000
# The SCOPED READ-ONLY token from scripts/provision-agent-identity.py — never a superuser token.
AUTHENTIK_TOKEN=
```

- [ ] **Step 2: Document v1 in the README** (`mcp-servers/code-mode/README.md`)

Add a "Security (v1)" section stating: the server is propose-only (no `execute_write`); `AUTHENTIK_TOKEN` must be the scoped read token from `scripts/provision-agent-identity.py`; tools are `search`, `execute` (read-only), `validate_blueprint` (propose-only), `docs`; link to `docs/agent-security-model.md`.

- [ ] **Step 3: Run the full suite once more**

Run (from `mcp-servers/code-mode`): `node --test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mcp-servers/code-mode/README.md mcp-servers/code-mode/.env.example .mcp.json
git commit -m "docs(code-mode): document v1 propose-only security posture"
```

---

## Self-Review

**Spec coverage** (against `docs/agent-security-model.md` v1 row in §10):

- "scoped read token (allow-list, deny `view_*_key`)" → Task 5 (allow-list rule denies `*_key` and `*token`); verified in Task 5 Step 3.
- "MCP content-validator (validate-only)" → Tasks 3 + 4.
- "default `AUTHENTIK_URL`" → Task 1.
- "cannot mutate anything" → Task 4 removes `execute_write`; Task 2 blocks secret reads.
- Defense-in-depth secret-path block (doc §7) → Task 2.

**Placeholder scan:** none — every code step has complete code; the README step (Task 6 Step 2) is prose-only by nature (a doc section), not logic.

**Type consistency:** `validateBlueprint`/`BlueprintValidation` defined in Task 3 and consumed identically in Task 4; `createTools` returns `{ search, execute, validate }` in Task 4 and the smoke/tools tests assert that exact shape; `isSecretRevealPath` exported in Task 2 and imported in its test.

**Open follow-ups (NOT in v1, tracked in doc §11):** enumerate the full secret-reveal perm set beyond the `_key`/`token` suffixes; the blueprint deny-list should be audited against authentik's real model labels (the set in Task 3 covers the security-critical ones); apply-path + `ak-agent authorise` are v2.
