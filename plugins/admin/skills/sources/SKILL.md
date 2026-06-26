---
name: sources
description: >
    Let people log in to authentik with an account they already have, or pull users
    in from a directory. Covers social login ("add a Log in with Google / Microsoft
    / GitHub / Apple button") plus SAML/OIDC federation, LDAP and Active Directory
    directory sync, Kerberos, inbound SCIM, and Plex. Use when someone wants "log in
    with X" on the authentik login page, or wants to import users from a directory.
    For an app that should *trust* authentik for login, use providers; the login
    page's button placement is owned here, its flow shape by flows-stages.
---

# authentik sources

## Purpose

A Source lets users authenticate to authentik with an account that lives somewhere
else, and optionally syncs those users in. This is the "Log in with Google" button
and the Active Directory import. Getting it working means registering an OAuth/SAML
app on the upstream side, mapping its attributes to authentik users, and surfacing
the source on the right flow. This skill owns that setup.

## When to invoke

- "I want to log into authentik via my Google account."
- "Add a 'Sign in with GitHub / Apple / Microsoft' button."
- "Sync users from Active Directory / LDAP into authentik."
- "Federate authentik with another SAML or OIDC identity provider."
- Questions about source property mappings, user matching, or directory sync.

Not this skill: authentik as the IdP for downstream apps (providers), or the rest of
the flow the source's button sits in (flows-stages owns the flow, this skill owns the
source and its binding onto the login page).

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

Each step is tagged by **where it happens**: `[authentik]` in the instance,
`[vendor]` on the upstream provider, `[docs]` in the live docs. Every `[authentik]`
step gives both paths: the hands-off code-mode propose, and the click-by-click admin
UI. Narrate it as one flow.

### Add a "Log in with Google / Microsoft / GitHub" button

**Result:** the authentik login page shows a social button; clicking it logs the user
in with that account, creating an authentik user on first use.

1. **[vendor]** Register an OAuth app on the provider (Google Cloud console, Entra app
   registration, or a GitHub OAuth app). Set the authorized redirect URI to
   `https://authentik.company/source/oauth/callback/<slug>/`, where `<slug>` is the
   source slug you set next. Copy the client ID / secret (consumer key / secret).
2. **[authentik]** Create the source:
    - _Hands-off:_ code-mode proposes the source Blueprint; apply it.
    - _In the UI:_ **Directory → Federation and Social login → New Source** → pick e.g.
      **Google OAuth Source**; set the **Slug** (must match the callback URL) and paste
      the **Consumer Key / Consumer Secret**.
3. **[authentik]** Surface it — a source does nothing until it is bound to the
   identification stage: **Flows and Stages → Flows → default-authentication-flow →
   Stage Bindings** → edit **default-authentication-identification** → add the source
   under **Selected sources**.
4. **[docs]** `<docs>` users-sources/sources/social-logins/<provider> for the exact
   scopes and console steps.

**Gotchas:** the **callback slug must match** the source slug exactly or the provider
rejects the redirect; a source **not added to the identification stage never appears**
on the login page; some providers (Google) send no username, so first-login users are
prompted to pick one unless you map it from their email.
**Verify:** log out, load the login page, confirm the social button appears, and a
test login lands you authenticated.

### Sync users in from Active Directory (LDAP)

**Result:** AD users and groups appear in authentik's Directory and refresh on a
schedule.

1. **[vendor]** In AD, create a read-only service account and note its UPN, the server
   host, and your base DN (e.g. `DC=ad,DC=company`).
2. **[authentik]** Create the LDAP source:
    - _Hands-off:_ code-mode proposes the LDAP source Blueprint; apply it.
    - _In the UI:_ **Directory → Federation and Social login → New Source → LDAP
      Source**; set **Server URI** (`ldaps://ad.company`), **Bind CN**
      (`svc@ad.company`), **Bind Password**, and **Base DN**; enable **Sync users** and
      **Sync groups**; select the default AD/LDAP **property mappings**.
3. **[authentik]** Watch the sync — it runs as a scheduled background task, not
   instantly: **Dashboards → System Tasks** (find the source's task), or trigger it
   manually.
4. **[docs]** `<docs>` users-sources/sources/protocols/ldap and directory-sync/active-directory.

**Gotchas:** sync **silently does nothing if no property mappings are selected**; a
TLS/StartTLS or SNI mismatch makes the bind fail — match the toggle to your server;
nested groups need **Lookup using a user attribute** with the `memberOf` rule.
**Verify:** after the task runs, synced users appear under **Directory → Users**.
