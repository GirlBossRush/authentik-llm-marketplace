---
name: authenticators-mfa
description: >
    Turn on multi-factor authentication — require a second factor or passkey at
    login, and let users enrol a phone authenticator or security key. Covers TOTP
    apps, WebAuthn and passkeys (including hardware keys like YubiKey), the authentik
    push authenticator, Duo, SMS, and static recovery codes, plus the authenticator
    and validation stages that enrol and enforce them. Use when someone wants to
    require MFA, let users register a security key, or fix why MFA is or isn't
    prompted. The surrounding flow plumbing lives in flows-stages.
---

# authentik authenticators and MFA

## Purpose

authentik delivers MFA through authenticator stages (which enrol a device) and
authenticator validation stages (which require one at login). This skill picks the
right device types, enrols them in the correct flow, and enforces them, so that
"users must use a second factor" actually holds for the right people on the right
applications.

## When to invoke

- "I want users to log in with a YubiKey / passkey / security key." (WebAuthn)
- "Require TOTP / an authenticator app for admins."
- "Enable push notifications with the authentik mobile app."
- "Set up Duo or SMS as a second factor."
- "Why is MFA not being prompted?" or "users can't register a security key."

Not this skill: where in the login sequence the validation step sits or how the
enrollment flow is shaped (flows-stages), though the two are commonly used together.

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

Each step is tagged by **where it happens**: `[authentik]` in the instance, `[docs]`
in the live docs. Every `[authentik]` step gives both paths — the hands-off code-mode
propose, and the click-by-click admin UI.

### Require MFA for everyone at login

**Result:** users must present a second factor each login, and anyone without one is
walked through enrolling it.

1. **[authentik]** Add validation plus enrolment to the authentication flow:
    - _Hands-off:_ code-mode proposes the stage-binding Blueprint; apply it.
    - _In the UI:_ create an **Authenticator Validation** stage — set **Device
      classes** (e.g. TOTP, WebAuthn), **Not configured action = Configure**, and list
      a setup stage (e.g. **authenticator_totp**) under **Configuration stages**. Bind
      it into **default-authentication-flow** after the password stage.
2. **[docs]** `<docs>` flows-stages/stages/authenticator_validate, plus the totp and
   webauthn setup stages.

**Gotchas:** **Not configured action = Deny with no Configuration stages locks out
everyone without a device** — use **Configure** to force enrolment instead; **Skip**
(the default) lets un-enrolled users bypass MFA entirely; pick the **device classes**
you actually accept.
**Verify:** a user with no device is forced to enrol, then prompted on next login.

### Require MFA only for specific apps

**Result:** MFA is prompted for a chosen app, not globally.

- **[authentik]** Gate the validation with a policy bound to the Application (or its
  flow) so it runs only for that app — bind in **Applications → [app] → Bindings**.
  Hand the binding mechanics to **policies-rbac**.

**Gotchas:** app-scoped vs global — make sure the validation isn't already forced in
the shared authentication flow.
**Verify:** the gated app prompts for MFA; others don't.

### Which authenticator should I use?

| Pick                   | When                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| **WebAuthn / passkey** | Strongest and phishing-resistant: hardware keys, Touch ID, Windows Hello |
| **TOTP**               | Broadest support: any authenticator app, works offline                   |
| **Email**              | Low-friction fallback, only as strong as the mailbox                     |
| **Duo / SMS**          | An existing Duo estate, or last-resort SMS (the weakest factor)          |
