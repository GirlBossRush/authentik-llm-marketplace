---
name: applications
description: >
  Create and manage authentik Application objects and follow the integration
  catalog to connect a specific third-party service. Use when a user names a
  service they want to put behind authentik ("integrate Grafana", "put Nextcloud
  behind SSO", "set up GitLab login") or asks about the Application object:
  launch URL, icon, provider binding, authorization policy, and application
  entitlements. The Application is the user-facing object; the protocol lives in
  a Provider, so pair this skill with providers.
---

# authentik applications and integrations

## Purpose

An Application in authentik is the object users see on their My applications page.
It binds a Provider (the protocol) to authorization policies and presentation
(name, icon, launch URL, group). authentik also publishes per-service integration
guides covering the exact settings for hundreds of named apps. This skill creates
and wires up Applications and follows those guides for a specific target service.

## When to invoke

- "I want to integrate [named SaaS or self-hosted app] with authentik."
- "Put [app] behind authentik SSO."
- "Why doesn't my application show up on the user dashboard?"
- "How do I restrict who can launch this application?"
- Questions about launch URL, app icon, provider binding, or app entitlements.

Not this skill: configuring the protocol itself (providers), letting
users log in _with_ an external account (sources), or the authorization
rules in depth (policies-rbac).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
