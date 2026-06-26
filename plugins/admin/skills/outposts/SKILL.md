---
name: outposts
description: >
    Run the component that guards a proxied app, an LDAP or RADIUS endpoint,
    or browser-based remote access. Covers the embedded outpost and external outposts
    for Proxy (forward-auth), LDAP, RADIUS, and Remote Access (RAC), plus Docker and
    Kubernetes deployment, the outpost token and authentik_host connection, and the
    reverse-proxy / forward-auth wiring. Use when a proxy, LDAP, or RADIUS provider
    needs somewhere to run, or an outpost shows unhealthy. The provider object itself
    lives in providers; the app tile in applications.
---

# authentik outposts

## Purpose

Some providers (Proxy, LDAP, RADIUS, RAC) need a runtime that sits in the traffic path
rather than living inside the authentik server. That runtime is an Outpost. This skill
chooses between the embedded and external outpost, deploys it on Docker or Kubernetes,
connects it back to authentik, and wires the surrounding reverse proxy or forward-auth
so the provider serves traffic.

## When to invoke

- "I set up a proxy provider — now what runs it?"
- "Deploy an LDAP / RADIUS outpost."
- "Configure forward-auth with nginx / Traefik / Caddy in front of an app."
- "My outpost is showing unhealthy / not connecting."
- "Set up browser-based RDP/SSH access." (RAC outpost)

Not this skill: configuring the provider object itself (providers) or the application
binding (applications). The outpost is the deployment layer beneath them.

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

Steps are tagged by **where it happens**: `[authentik]` in the instance, `[host]` on
the server/cluster running the outpost, `[docs]` in the live docs.

### Deploy a proxy outpost for forward-auth

**Result:** the outpost runs and enforces your Proxy provider in front of the app.

1. **[authentik]** Create the outpost and attach the provider: **Applications → Outposts
   → Create**; **Type = Proxy**; **Integration =** Docker / Kubernetes / manual; add the
   proxy-provider application(s). code-mode can read the outpost's health and config.
2. **[host]** Deploy the runtime: managed **Docker/Kubernetes** lets authentik create it;
   for **manual**, set `AUTHENTIK_HOST` (full URL, trailing slash) and `AUTHENTIK_TOKEN`
   (the outpost token) and run the container.
3. **[host]** Wire the reverse proxy: nginx `auth_request` to `/outpost.goauthentik.io/auth/...`,
   or a Traefik `forwardauth` middleware.
4. **[docs]** `<docs>` add-secure-apps/outposts, and providers/proxy for nginx/Traefik/Caddy examples.

**Gotchas:** everything under `/outpost.goauthentik.io` must be reachable: test
`curl -v https://app.company/outpost.goauthentik.io/ping`, expecting **HTTP 204**;
`authentik_host` must be a **full URL with scheme** (not a bare hostname or IP); without
the proxy auth directive, authentication is bypassed or loops.
**Verify:** the outpost shows healthy in the UI and the app redirects through authentik.

### Embedded vs external outpost

| Use                           | When                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **Embedded**                  | Simplest: runs inside the authentik server; fine when authentik already sits behind your proxy |
| **External** (managed/manual) | Independent scaling or lifecycle, or an outpost in a DMZ separate from the core network        |

### Forward-auth returns 401 or loops

Work the usual causes in order:

1. **[host]** Is `/outpost.goauthentik.io/ping` reachable (HTTP 204)? If not, the proxy
   or WAF is blocking the path.
2. **[host]** Is the `auth_request` / `forwardauth` directive present and pointed at the
   outpost? Missing means a bypass or a loop.
3. **[authentik]** In domain mode, does the **Cookie domain** match the shared parent
   domain?
4. **[authentik]** Can the outpost reach authentik — is `authentik_host` a full URL?
5. **[authentik]** Still looping? Set the outpost **log level to trace** (Outpost →
   Advanced settings) and read the logs; check clock skew and any HTTP/HTTPS mismatch.

For the provider-mode choice (single vs domain), hand back to **providers**.
