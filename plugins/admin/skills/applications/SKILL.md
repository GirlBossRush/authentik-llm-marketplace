---
name: applications
description: >
    Connect a specific named app or service to authentik so its users sign in
    with their authentik account (SSO): "integrate Grafana", "put Nextcloud
    behind SSO", "set up GitLab login", "add Proxmox to authentik". It finds the
    service's integration guide and walks through both sides (the authentik
    Application/Provider and the settings to paste on the vendor) so the user
    never juggles tabs. Also owns the Application object
    itself: launch URL, icon, provider binding, who may launch it, and application
    entitlements. Protocol details live in providers; external login *into*
    authentik lives in sources.
---

# authentik applications and integrations

## Purpose

An Application is the object a user sees on their **My applications** page. It ties
a Provider (the protocol) to who is allowed in and how it is presented (name, icon,
launch URL). authentik also publishes a per-service integration guide for hundreds
of named apps. This skill connects one of them end to end: it reads
the guide, drives the authentik side, and tells the user exactly what to set on the
vendor side.

## When to invoke

- "Integrate [Grafana / Nextcloud / GitLab / Proxmox / …] with authentik."
- "Put [app] behind SSO" or "let my team log into [app] with their accounts."
- "Why doesn't my application show up on the user dashboard?"
- "Restrict who can launch this application."
- Anything about launch URL, app icon, provider binding, or entitlements.

Not this skill: the protocol fields themselves (providers), login _with_ an
external account (sources), or authorization logic in depth (policies-rbac).

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
`[vendor]` on the third-party app, `[docs]` in the integration guide. Every
`[authentik]` step gives both paths: the hands-off code-mode propose, and the
click-by-click admin UI. Narrate it as one flow so the user never switches tabs.

### Let my team log into <named service> with their authentik accounts

**Result:** the app shows a "Log in with authentik" button; authentik handles the
password and hands the app the user's identity, and where supported their role.

1. **[docs]** Resolve the integration guide: fetch `<integrations>/llms.txt`, find
   the named service, fetch its `.md`. Every guide is laid out as _Preparation_
   (placeholders like `app.company` / `authentik.company`), _authentik
   configuration_, and _<service> configuration_. Drive the first, dictate the second.
2. **[authentik]** Create the Application + Provider pair:
    - _Hands-off:_ code-mode proposes an `authentik_core.application` + provider
      Blueprint (`validate_blueprint` → `prepare_apply`); run the printed
      `ak apply_blueprint` to commit.
    - _In the UI:_ **Applications → Applications → New Application**; pick the provider
      type the guide names (usually **OAuth2/OpenID Connect** or **SAML**); set the
      **Redirect URI** to the app's exact callback; pick a **Signing Key**; capture
      the **Client ID** / **Client Secret**.
3. **[vendor]** On the app, paste what the guide's _<service> configuration_ lists:
   client ID/secret and authentik's authorize/token/userinfo URLs (OIDC), or the
   metadata/ACS URL (SAML).
4. **[authentik]** _(optional)_ Add **Application entitlements** to map authentik
   users/groups onto the app's roles (e.g. Grafana Admin/Editor/Viewer).

**Gotchas:** the **Client Secret is shown once** — capture it immediately; the
**Redirect URI must match the app's callback exactly** (a blank or guessed URI fails
silently, and the app then won't appear on the dashboard); omitting a **Signing Key**
breaks token signing; entitlement names must match what the app reads (e.g. Grafana's
`role_attribute_path`).
**Verify:** open the app's login page, click the authentik button, land logged in
with the expected role.

### Restrict who can launch an app

**Result:** only the chosen users/groups see and can launch the app; everyone else is
denied.

1. **[authentik]** Add a binding on the Application:
    - _Hands-off:_ code-mode proposes a policy/group binding Blueprint; apply it.
    - _In the UI:_ **Applications → Applications → [app] → Bindings** tab → bind a
      group, user, or policy.
2. **[docs]** `<docs>` bindings-overview for binding types and evaluation order.

**Gotchas:** **zero bindings means everyone gets in** — authentik is allow-by-default,
not deny-by-default; the **policy-engine mode** (ANY vs ALL, set on the app) decides
whether one or every binding must pass; a disabled binding is silently skipped.
**Verify:** a non-member no longer sees the app; a member still does. For deeper
authorization logic, hand off to **policies-rbac**.

### My app isn't showing on the user dashboard

**Result:** the app appears for the users who should have it.

1. **[authentik]** Check the two requirements, reading first:
    - _Hands-off:_ code-mode `execute` to read the Application — is there a valid
      **Launch URL**, and does the user pass its bindings?
    - _In the UI:_ **Applications → [app]** → confirm a **Launch URL** starting with
      `http://`, `https://`, or a relative path, and check the **Bindings** tab.
2. **[docs]** `<docs>` applications (Appearance) for launch-URL rules; troubleshooting/access for denial debugging.

**Gotchas:** a **blank or invalid Launch URL** makes the app invisible even though it
exists; the user may be failing a **binding** (set the `goauthentik.io/user/debug`
attribute on a user to see why); the provider's **authorization flow** must be set.
**Verify:** the app shows for a member on their My applications page. For tangled
cases, hand off to **troubleshooting**.
