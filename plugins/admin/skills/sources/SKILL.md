---
name: sources
description: >
  Configure Sources, where authentik trusts an external identity provider so
  users can log in with an existing account. Covers social and federated login
  (Google, GitHub, Apple, Discord, Microsoft Entra ID, Twitch, and other OAuth
  sources), SAML and OIDC sources, LDAP and Active Directory directory sync,
  Kerberos, SCIM inbound, and Plex. Use when a user wants "log in with X" on
  their authentik login page or wants to import users from a directory. For
  authentik *being* the IdP that apps trust, use providers.
---

# authentik sources

## Purpose

A Source lets users authenticate to authentik with an account that lives
somewhere else, and optionally syncs those users in. This is the "Log in with
Google" button and the Active Directory import. Getting it working means
registering an OAuth/SAML app on the upstream side, mapping its attributes to
authentik users, and binding the source into the right enrollment or
authentication flow. This skill owns that setup.

## When to invoke

- "I want to log into authentik via my Google account."
- "Add a 'Sign in with GitHub / Apple / Microsoft' button."
- "Sync users from Active Directory / LDAP into authentik."
- "Federate authentik with another SAML or OIDC identity provider."
- Questions about source property mappings, user matching, or directory sync.

Not this skill: authentik as the IdP for downstream apps (providers),
or how the source's button appears mid-login (flows-stages owns the
flow binding, this skill owns the source itself).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
