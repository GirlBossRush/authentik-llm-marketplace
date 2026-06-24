---
name: authenticators-mfa
description: >
  Set up multi-factor authentication and authenticator devices. Covers TOTP
  apps, WebAuthn and passkeys (including hardware keys like YubiKey), the
  authentik mobile push authenticator, Duo, SMS, and static recovery codes —
  plus enrolling these via authenticator stages and enforcing MFA with validation
  stages and policies. Use when a user wants to require a second factor, let users
  register a security key, or troubleshoot why MFA is or isn't being prompted.
---

# authentik authenticators and MFA

## Purpose

authentik delivers MFA through authenticator stages (which enroll a device) and
authenticator validation stages (which require one at login). This skill picks
the right device types, enrolls them in the correct flow, and enforces them, so
that "users must use a second factor" actually holds for the right people on the
right applications.

## When to invoke

- "I want users to log in with a YubiKey / passkey / security key." (WebAuthn)
- "Require TOTP / an authenticator app for admins."
- "Enable push notifications with the authentik mobile app."
- "Set up Duo or SMS as a second factor."
- "Why is MFA not being prompted?" or "users can't register a security key."

Not this skill: where in the login sequence the validation step sits or how the
enrollment flow is shaped (flows-stages), though the two are commonly
used together.

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
