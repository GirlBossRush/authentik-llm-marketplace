---
name: policies-rbac
description: >
  Control authorization with Policies and role-based access control. Covers
  expression, password, reputation, event-matcher, and GeoIP policies; how
  policies bind to flows, stages, applications, and sources; and authentik's RBAC
  with roles, global and object-level permissions. Use when a user wants to decide
  who can access an application, gate a flow or stage on a condition, enforce
  password rules, or delegate admin permissions to a role or group.
---

# authentik policies and RBAC

## Purpose

Policies are authentik's decision points: each returns pass or fail and is bound
to a flow, stage, application, or source to gate behavior. RBAC governs who can
administer authentik itself. This skill writes policies (including expression
policies), binds them in the right place with the right order, and assigns
permissions to roles and groups.

## When to invoke

- "Only let this group access this application."
- "Block login from certain countries / flag suspicious logins." (GeoIP, reputation)
- "Enforce a password complexity / length rule."
- "Run this step only when [condition]." (expression policy on a binding)
- "Give this team admin over only their own applications." (object-level RBAC)

Not this skill: the user and group records themselves (users-directory)
or the flow/stage structure the policy attaches to (flows-stages).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
