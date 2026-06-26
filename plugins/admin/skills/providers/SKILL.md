---
name: providers
description: >
    Make an app trust authentik for login (SSO) so users sign into Grafana, Nextcloud,
    GitLab and the like with an authentik account, expose authentik over LDAP or
    RADIUS, protect an app that has no login of its own via forward-auth, or push
    users out to Google Workspace or Microsoft Entra. Covers OAuth2/OIDC, SAML, LDAP,
    RADIUS, Proxy, SCIM, RAC, and the property mappings that shape their claims. Use
    when picking or filling in a provider's protocol fields. For login *into*
    authentik with an external account, use sources; the app tile and the end-to-end
    connect-a-service walkthrough live in applications.
---

# authentik providers

## Purpose

A Provider defines the protocol authentik speaks when an application delegates
authentication to it. Picking the right provider type and filling in its protocol
fields (redirect URIs, ACS URLs, entity IDs, scopes, property mappings) is where most
integration work and most mistakes happen. This skill configures each provider type
and the property mappings that shape its claims or attributes.

## When to invoke

- "How do I configure SAML / OIDC in authentik?"
- "I want users to log into [app] using authentik." (OAuth2/OIDC provider)
- "Protect an app that has no SSO support." (Proxy / forward-auth provider)
- "Expose authentik over LDAP / RADIUS."
- "Provision my users into Google Workspace / Entra ID." (outbound providers)

Not this skill: the user-facing Application object and the named-service walkthrough
(applications), external login sources (sources), or deploying the proxy/LDAP/RADIUS
runtime (outposts).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** use the authentik docs base URL from your session context (or the
  `authentik-code-mode` MCP's `docs` tool, which returns the version-accurate
  URLs for this instance), then fetch `<docs>/llms.txt` (integrations:
  `<integrations>/llms.txt`), follow the index to the right page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP. `search` for the API
  operation, then `execute` to read the current state. code-mode never writes — to
  change the instance, `validate_blueprint` then `prepare_apply` a Blueprint, which
  returns the exact `ak apply_blueprint` command for you to run. Learn the concept
  from the docs first.

## Common workflows

Each step is tagged by **where it happens**: `[authentik]` in the instance, `[vendor]`
on the app, `[docs]` in the live docs. Every `[authentik]` step gives both paths — the
hands-off code-mode propose and the click-by-click admin UI. For a specific named
service, start from the **applications** walkthrough; come here for the protocol depth.

### Which provider type do I need?

| The app…                           | Provider                            |
| ---------------------------------- | ----------------------------------- |
| speaks OpenID Connect / OAuth2     | **OAuth2/OpenID**                   |
| speaks SAML                        | **SAML**                            |
| has no login of its own            | **Proxy** (forward-auth) + Outpost  |
| needs an LDAP bind                 | **LDAP**                            |
| authenticates network gear / a VPN | **RADIUS**                          |
| should receive users you push out  | **SCIM / Google Workspace / Entra** |

### Set up OIDC (OpenID Connect) SSO for an app

**Result:** the app delegates login to authentik over OAuth2/OIDC.

1. **[authentik]** Create the OAuth2/OpenID provider + application:
    - _Hands-off:_ code-mode proposes the provider + app Blueprint; apply it.
    - _In the UI:_ **Applications → Applications → New Application → OAuth2/OpenID**; set
      the **Redirect URI** (Strict, exact match), pick a **Signing Key**, note the
      **Client ID / Secret**, and add the scopes the app needs.
2. **[vendor]** Paste the client ID/secret and authentik's authorize/token/userinfo
   URLs into the app.
3. **[docs]** `<docs>` add-secure-apps/providers/oauth2, plus the app's integration guide.

**Gotchas:** refresh tokens need the **`offline_access` scope added explicitly** (since
2024.2); the app slug can't be a reserved word (`authorize`, `token`, `userinfo`, …);
since 2025.10 `email_verified` defaults to false, so add a custom mapping if the app
requires true.
**Verify:** the app's "log in with authentik" round-trips and returns the expected claims.

### Set up SAML SSO for an app

**Result:** the app delegates login to authentik over SAML.

1. **[authentik]** Create the SAML provider + application:
    - _In the UI:_ **New Application → SAML Provider**; set the **ACS URL** to the app's
      exact endpoint, choose a **Signing Certificate** and the **NameID** mapping;
      download the metadata from the provider's **Metadata** tab.
    - _Hands-off:_ code-mode proposes it; apply it.
2. **[vendor]** Import authentik's metadata (or set the ACS URL / EntityID) on the app.
3. **[docs]** `<docs>` add-secure-apps/providers/saml.

**Gotchas:** the **ACS URL and EntityID must match the app's values exactly** (an extra
slash fails silently); **don't use email as the NameID** (changing email breaks SSO;
use a persistent identifier); clock skew between IdP and app invalidates assertions.
**Verify:** SP-initiated login from the app lands authenticated.

### Protect an app that has no SSO (forward-auth)

**Result:** authentik gates an app that can't speak any SSO protocol.

1. **[authentik]** Create a Proxy provider + application: **New Application → Proxy
   Provider**; pick the mode — **Proxy** (authentik reverse-proxies it), **Forward auth
   (single)** (one app behind your existing proxy), or **Forward auth (domain)** (many
   subdomains, one cookie domain); set the **External host** (and Internal host in Proxy
   mode).
2. **[authentik]** Attach it to an Outpost — hand the runtime and reverse-proxy wiring
   to **outposts**.
3. **[docs]** `<docs>` add-secure-apps/providers/proxy.

**Gotchas:** in domain mode the **Cookie domain must be the shared parent domain** or
SSO won't span apps; everything under `/outpost.goauthentik.io` must be reachable
through your proxy; the outpost must be running.
**Verify:** hitting the app redirects to authentik then back, authenticated.

### Push users out to Google Workspace or Entra

**Result:** authentik provisions and syncs users into the target directory.

1. **[authentik]** Create the **Google Workspace** or **Microsoft Entra** provider, then
   set it as a **Backchannel Provider** on an Application: **Applications → Providers →
   New**; supply the service-account JSON + delegated subject (GWS) or client
   ID/secret/tenant (Entra), plus the property mappings.
2. **[vendor]** Grant the credentials the required directory scopes on the target.
3. **[docs]** `<docs>` add-secure-apps/providers/gws or /entra.

**Gotchas:** GWS needs **domain-wide delegation** with the directory scopes and a
non-admin delegated subject; Entra fails provisioning for **unverified email domains**
(verify them or use a custom mapping); sync is scheduled (watch **System Tasks**), not
instant; rotate the Entra client secret before it expires.
**Verify:** a test user created in authentik appears in the target after a sync.
