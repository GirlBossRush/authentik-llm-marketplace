---
name: operations
description: >
  Administer the authentik instance lifecycle. Covers checking the running
  version and update status, upgrades, recovering a locked-out admin account via
  a recovery key, certificates and crypto, Brands (formerly Tenants), global
  system settings, and blueprints for declarative configuration. Use when a user
  asks an instance-level operational question — "which version am I running",
  "reset my admin password", "rotate this certificate" — as opposed to
  configuring authentication features.
---

# authentik operations

## Purpose

This skill handles authentik as a running system rather than its authentication
features: what version it is, how to upgrade it, how to get back in when the admin
account is locked out, and how to manage instance-wide settings, certificates,
brands, and blueprints. These are the lifecycle and recovery tasks an operator
reaches for.

## When to invoke

- "Which version of authentik am I running?" / "Is there an update?"
- "Reset my admin password" or "I'm locked out of the superuser account."
  (recovery key / recovery flow)
- "Rotate or import a certificate." (crypto)
- "Change instance-wide branding / settings." (Brands, settings)
- "Manage configuration as code." (blueprints)

Not this skill: resetting another ordinary user's password
(users-directory), or diagnosing a runtime failure
(troubleshooting).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
