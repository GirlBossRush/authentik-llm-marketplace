---
name: policies-rbac
description: >
    Control who can use an app or reach a step, and who can administer authentik. Use
    when a user wants to limit an app to a group, block login by country or time of
    day, defend against brute force, enforce password rules, or delegate admin rights
    to a role. Covers expression, reputation, GeoIP, password, and password-expiry
    policies; how policies bind to applications, flows, stages, and sources; and RBAC
    roles and object-level permissions. The user and group records themselves live in
    users-directory; the flow structure a policy attaches to lives in flows-stages.
---

# authentik policies and RBAC

## Purpose

Policies are authentik's decision points: each returns pass or fail and is bound to a
flow, stage, application, or source to gate behavior. RBAC governs who can administer
authentik itself. This skill writes policies (including expression policies), binds
them in the right place with the right order, and assigns permissions to roles and
groups.

## When to invoke

- "Only let this group access this application."
- "Block login from certain countries / flag suspicious logins." (GeoIP, reputation)
- "Enforce a password complexity / length rule."
- "Run this step only when [condition]." (expression policy on a binding)
- "Give this team admin over only their own applications." (object-level RBAC)

Not this skill: the user and group records themselves (users-directory) or the
flow/stage structure the policy attaches to (flows-stages).

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

### Which policy type do I need?

| Goal                                    | Policy type                                 |
| --------------------------------------- | ------------------------------------------- |
| Limit access to a group or user         | a **group/user binding** (no policy needed) |
| Custom logic / inspect the request      | **Expression** (Python)                     |
| Slow brute force / CAPTCHA risky logins | **Reputation**                              |
| Allow or deny by country / travel       | **GeoIP**                                   |
| Enforce password strength               | **Password**                                |
| Force a periodic password change        | **Password Expiry**                         |

### Restrict an app to a specific group

**Result:** only members of the group can access the app.

1. **[authentik]** Bind the group on the Application:
    - _Hands-off:_ code-mode proposes the binding Blueprint; apply it.
    - _In the UI:_ **Applications → [app] → Bindings** → bind the group.
2. **[docs]** `<docs>` bindings-overview and policies/bindings.

**Gotchas:** **no bindings means everyone gets in** (allow-by-default); the
**policy-engine mode** (ANY/ALL, set on the app) decides whether one or every binding
must pass; use **Negate** for "everyone except".
**Verify:** a non-member is denied; a member still gets in.

### Restrict by time of day or location

**Result:** access is allowed only inside a time window or from allowed regions.

- **[authentik]** Bind an **Expression** policy (a time check against `request`) or a
  **GeoIP** policy (allowed countries) to the app or its flow. code-mode can propose it,
  or create it under **Customize → Policies** and bind it.

**Gotchas:** expression time checks use the **server timezone**; GeoIP needs the
**GeoIP database** present; set the binding's **failure result** deliberately
(fail-closed for sensitive apps).
**Verify:** access is blocked outside the window or region and allowed inside it.

### Require MFA only when a condition holds

**Result:** the MFA step runs only when your policy matches (e.g. off the office
network).

- **[authentik]** Bind a policy to the **authenticator_validate** stage binding so it
  evaluates per login; pair with **authenticators-mfa** for the stage itself.

**Gotchas:** policies on a stage binding evaluate when the user reaches them — enable
**Evaluate when flow is planned** if you need the decision upfront.
**Verify:** MFA prompts only when the condition is true.
