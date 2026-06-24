---
name: outposts
description: >
  Deploy and manage Outposts, the authentik components that run a provider's
  runtime outside the core server. Covers the embedded outpost and external
  outposts for Proxy (forward-auth), LDAP, RADIUS, and Remote Access (RAC),
  including Docker and Kubernetes deployment, the outpost token and API
  connection, and reverse-proxy / forward-auth wiring. Use when a proxy, LDAP,
  or RADIUS provider needs somewhere to run, or when an outpost shows unhealthy.
---

# authentik outposts

## Purpose

Some providers (Proxy, LDAP, RADIUS, RAC) need a runtime that sits in the traffic
path rather than living inside the authentik server. That runtime is an Outpost.
This skill chooses between the embedded and external outpost, deploys it on
Docker or Kubernetes, connects it back to authentik, and wires the surrounding
reverse proxy or forward-auth so the provider actually serves traffic.

## When to invoke

- "I set up a proxy provider — now what runs it?"
- "Deploy an LDAP / RADIUS outpost."
- "Configure forward-auth with nginx / Traefik / Caddy in front of an app."
- "My outpost is showing unhealthy / not connecting."
- "Set up browser-based RDP/SSH access." (RAC outpost)

Not this skill: configuring the provider object itself (providers) or
the application binding (applications). The outpost is the deployment
layer beneath them.

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
