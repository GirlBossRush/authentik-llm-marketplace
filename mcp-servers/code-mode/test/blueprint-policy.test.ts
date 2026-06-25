import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ALLOWED_MODELS,
    MODEL_ATTRS,
    CURATED_REFS,
    EXCLUDED_SCOPES,
    isDestructiveEntry,
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
        !([...curated] as string[]).includes(
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
    assert.ok(a);
    assert.equal(a.include_claims_in_id_token?.bin, "force");
    assert.equal(a.include_claims_in_id_token?.value, false);
    assert.equal(a.redirect_uris?.bin, "flag");
    assert.equal(a.issuer_mode?.bin, "force");
    assert.equal(a.sub_mode?.bin, "force");
    assert.equal(a.sub_mode?.value, "hashed_user_id");
    assert.equal(a.issuer_mode?.value, "per_provider");
});

test("relationship fields are binned as `ref` (FIX B)", () => {
    const app = MODEL_ATTRS["authentik_core.application"];
    assert.equal(app?.provider?.bin, "ref");

    const oauth = MODEL_ATTRS["authentik_providers_oauth2.oauth2provider"];
    assert.equal(oauth?.authorization_flow?.bin, "ref");
    assert.equal(oauth?.invalidation_flow?.bin, "ref");
    assert.equal(oauth?.signing_key?.bin, "ref");
    assert.equal(oauth?.property_mappings?.bin, "ref");

    const saml = MODEL_ATTRS["authentik_providers_saml.samlprovider"];
    assert.equal(saml?.authorization_flow?.bin, "ref");
    assert.equal(saml?.invalidation_flow?.bin, "ref");
    assert.equal(saml?.signing_kp?.bin, "ref");
    assert.equal(saml?.property_mappings?.bin, "ref");
});

test("isDestructiveEntry: deletes and crypto are destructive, plain creates are not", () => {
    assert.equal(
        isDestructiveEntry("authentik_sources_oauth.oauthsource", "absent"),
        true,
    );
    assert.equal(
        isDestructiveEntry("authentik_crypto.certificatekeypair", undefined),
        true,
    );
    assert.equal(
        isDestructiveEntry(
            "authentik_providers_oauth2.oauth2provider",
            undefined,
        ),
        false,
    );
});
