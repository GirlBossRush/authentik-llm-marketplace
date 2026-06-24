---
name: providers
description: >
  Configure Providers, where authentik acts as the identity provider and an
  application trusts it. Covers OAuth2/OIDC, SAML, LDAP, RADIUS, Proxy
  (forward-auth), SCIM, Remote Access (RAC), Shared Signals (SSF), and outbound
  provisioning to Google Workspace and Microsoft Entra ID. Use when a user asks
  to set up SAML/OIDC for an app, expose LDAP or RADIUS, protect an app that has
  no SSO support via the proxy, or provision users out to a downstream service.
  For login *into* authentik with an external account, use sources.
---

# authentik providers

## Purpose

A Provider defines the protocol authentik speaks when an application delegates
authentication to it. Picking the right provider type and filling in its
protocol fields (redirect URIs, ACS URLs, entity IDs, scopes, property mappings)
is where most integration work and most mistakes happen. This skill configures
each provider type and the property mappings that shape its claims or attributes.

## When to invoke

- "How do I configure SAML in authentik?"
- "I want users to log into Discord using authentik." (OAuth2/OIDC provider)
- "Protect an app that has no SSO support." (Proxy / forward-auth provider)
- "Expose authentik over LDAP / RADIUS."
- "Provision my users into Google Workspace / Entra ID." (SCIM-style providers)
- Anything about redirect URIs, ACS URLs, scopes, signing certs, or claims.

Not this skill: the user-facing Application object (applications),
external login sources (sources), or deploying the proxy/LDAP/RADIUS
runtime (outposts).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
