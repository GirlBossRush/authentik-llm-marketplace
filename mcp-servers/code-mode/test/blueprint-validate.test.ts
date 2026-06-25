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

// ---------------------------------------------------------------------------
// v2 adversarial bypass tests (task-2-review.md) — default-deny on tags
// ---------------------------------------------------------------------------

// C1 — shape-brittle !Find extraction. Alternate valid shapes must be rejected,
// not silently extract nothing and pass.

test("C1a: rejects empty !Find [] sequence", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find []`);
    assert.equal(r.ok, false);
});

test("C1b: rejects !Find with a scalar condition (inner not a seq)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, scope-openid]`);
    assert.equal(r.ok, false);
});

test("C1c: rejects !Find whose condition value is a nested sequence", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, [managed, [nested, seq]]]`);
    assert.equal(r.ok, false);
});

// C2 — only the FIRST condition inspected. A curated first condition plus a
// second real condition (pk lookup) AND-combines server-side → must reject.
test("C2: rejects multi-condition !Find (curated first + arbitrary second)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-openid], [pk, 999]]`);
    assert.equal(r.ok, false);
});

// C3 — default-deny on tags. Every resolving tag other than !Find/!KeyOf rejects.
test("C3a: rejects !FindObject (resolves+inlines an arbitrary object)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      property_mappings:
        - !FindObject [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-openid]]`);
    assert.equal(r.ok, false);
});

test("C3b: rejects !Context (reads instance context)", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs:
      name: x
      slug: x
      meta_description: !Context some_secret`);
    assert.equal(r.ok, false);
});

test("C3c: rejects other resolving tags (!Format, !Condition, !If, !File, !Enumerate, !Value, !Index, !AtIndex, !ParseJSON)", () => {
    const tags = [
        "!Format [foo]",
        "!Condition [AND, true]",
        "!If [true, a, b]",
        "!File secret.txt",
        "!Enumerate [[], SEQ, x]",
        "!Value x",
        "!Index 0",
        "!AtIndex 0",
        "!ParseJSON '{}'",
    ];
    for (const t of tags) {
        const r = validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs:
      name: x
      slug: x
      meta_description: ${t}`);
        assert.equal(r.ok, false, `tag ${t} should be rejected`);
    }
});

// C4 — scalar !Find must NOT throw; returns a violation instead.
test("C4: scalar !Find (tag on scalar) returns a violation, never throws", () => {
    let r: ReturnType<typeof validateBlueprint> | undefined;
    assert.doesNotThrow(() => {
        r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_saml.samlprovider
    attrs:
      name: x
      acs_url: !Find evil`);
    });
    assert.equal(r!.ok, false);
});

// I3 / #2 — !KeyOf must reference an id defined within THIS blueprint.
test("KeyOf to an undefined/external id is rejected", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_core.application
    attrs:
      name: x
      slug: x
      meta_launch_url: !KeyOf some-external-id`);
    assert.equal(r.ok, false);
});

test("KeyOf to an id defined within this blueprint is permitted", () => {
    const r = validateBlueprint(`version: 1
entries:
  - id: my-provider
    model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: prov
  - model: authentik_core.application
    attrs:
      name: x
      slug: x
      meta_launch_url: !KeyOf my-provider`);
    assert.equal(r.ok, true);
});

// I1 — negative cap.
test("I1: rejects a negative cap value", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      access_token_validity: -5`);
    assert.equal(r.ok, false);
});

// I2 — unknown duration unit must reject, not be ignored.
test("I2: rejects unknown duration units", () => {
    const r = validateBlueprint(`version: 1
entries:
  - model: authentik_providers_oauth2.oauth2provider
    attrs:
      name: x
      access_token_validity: "fortnights=10;hours=1"`);
    assert.equal(r.ok, false);
});
