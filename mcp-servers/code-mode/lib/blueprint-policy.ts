/** @file Policy data for the blueprint validator (v2 policy-enforcement point). */

export type AttrBin = "pass" | "flag" | "force" | "cap" | "ref";
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
        // The provider binding MUST be a permitted reference (a !KeyOf to a
        // provider defined in this blueprint, or a curated !Find). `policies`
        // bindings remain disallowed (not listed). See the validator's ref check.
        provider: { bin: "ref" },
    },
    "authentik_providers_oauth2.oauth2provider": {
        name: { bin: "pass" },
        client_type: { bin: "flag" },
        redirect_uris: { bin: "flag" },
        property_mappings: { bin: "ref" }, // references; constrained to curated scope mappings by the validator
        // Relationship fields: only a permitted reference is accepted (curated
        // !Find to the default flow / default signing key, or an in-blueprint
        // !KeyOf). Plain literals and non-curated refs are rejected.
        authorization_flow: { bin: "ref" },
        invalidation_flow: { bin: "ref" },
        signing_key: { bin: "ref" },
        sub_mode: { bin: "force", value: "hashed_user_id" },
        issuer_mode: { bin: "force", value: "per_provider" },
        include_claims_in_id_token: { bin: "force", value: false },
        access_code_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
        access_token_validity: { bin: "cap", maxSeconds: TOKEN_MAX },
    },
    "authentik_providers_saml.samlprovider": {
        name: { bin: "pass" },
        acs_url: { bin: "flag" },
        audience: { bin: "flag" },
        sp_binding: { bin: "flag" },
        // Field names confirmed against authentik's SAMLProviderSerializer /
        // ProviderSerializer: authorization_flow + invalidation_flow (base),
        // signing_kp (the signing keypair), property_mappings.
        authorization_flow: { bin: "ref" },
        invalidation_flow: { bin: "ref" },
        signing_kp: { bin: "ref" },
        property_mappings: { bin: "ref" },
    },
};

/** A blueprint entry that deletes any model or touches crypto is irreversible. */
export function isDestructiveEntry(
    model: string,
    state: string | undefined,
): boolean {
    return state === "absent" || model.startsWith("authentik_crypto.");
}
