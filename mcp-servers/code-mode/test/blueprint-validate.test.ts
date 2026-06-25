import { test } from "node:test";
import assert from "node:assert/strict";

import { validateBlueprint } from "#blueprint-validate";

// ---------------------------------------------------------------------------
// Existing v1 tests (kept; the rewrite must not regress them)
// ---------------------------------------------------------------------------

const APP = `version: 1
metadata: {name: ok}
entries:
  - model: authentik_core.application
    identifiers: {slug: my-app}
    attrs: {name: My App}`;

test("accepts an application-only blueprint", () => {
    const r = validateBlueprint(APP);
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
});

test("rejects a superuser group (denied model)", () => {
    const bp = `version: 1
entries:
  - model: authentik_core.group
    attrs: {is_superuser: true}`;
    const r = validateBlueprint(bp);
    assert.equal(r.ok, false);
    // v2 message: model not in allow-list (covers former "denied model" intent)
    assert.ok(r.violations.length > 0, "should have at least one violation");
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
        /client_secret/,
    );
});

test("rejects documents with no entries list", () => {
    assert.equal(
        validateBlueprint("version: 1\nmetadata: {name: x}").ok,
        false,
    );
});

// ---------------------------------------------------------------------------
// v2 policy-enforcement tests (from task-2-brief.md)
// ---------------------------------------------------------------------------

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
    assert.equal(validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs: "oops"`).ok, false);
});

test("normalizes model case before allow-list lookup", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: AUTHENTIK_CORE.Application
    attrs: {name: x, slug: x}`);
    assert.equal(r.ok, true);
});
