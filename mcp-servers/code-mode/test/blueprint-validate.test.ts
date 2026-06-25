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
