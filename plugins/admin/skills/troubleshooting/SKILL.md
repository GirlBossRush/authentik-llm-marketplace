---
name: troubleshooting
description: >
    Diagnose a broken or degraded authentik instance from the symptom. Use when "I
    can't log in", "the app rejects the token / invalid issuer", "it redirects in a
    loop after login", "emails aren't sending", "forward-auth returns 401", or "a CSRF
    error when I save", plus slow performance, stuck background tasks, and worker
    health. Works symptom → first check → likely cause → the skill that owns the fix.
    Routine audit-log reading lives in events-monitoring; upgrades and admin recovery
    in operations.
---

# authentik troubleshooting

## Purpose

When authentik misbehaves, the cause is usually in a place the admin hasn't looked: the
worker, a failed system task, SMTP settings, a provider mismatch, or a reverse proxy
header. This skill works from symptom to evidence to root cause (checking system tasks,
logs, and component health) instead of guessing at fixes, then hands off to the skill
that owns the repair.

## When to invoke

- "I/my users can't log in."
- "The app rejects the token" or "invalid issuer."
- "It redirects in a loop after login."
- "authentik isn't sending emails" or "the UI is slow / a task is stuck."
- "Forward-auth returns 401" or "I get a CSRF error when saving."

Not this skill: routine reading of the audit log (events-monitoring) or lifecycle tasks
like upgrades and admin recovery (operations), though a diagnosis often ends by pointing
at one of those.

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

## Symptom decision tree

For each symptom: the first thing to check (tagged `[authentik]` in the instance,
`[host]` on the server, `[vendor]` on the proxy/app), the usual cause, and the skill
that owns the fix.

### "Users can't log in"

- **[authentik]** First check: is the authentication flow intact, and can you reach
  `/if/flow/initial-setup/` (trailing slash)? Read recent `login_failed` events for the
  reason.
- Usual cause: a broken or misbound stage, or a denying policy.
- Fix: repair the flow (→ flows-stages); if locked out entirely, mint a recovery key
  (→ operations).

### "The app rejects the token" / "invalid issuer"

- **[authentik]** First check: set `goauthentik.io/user/debug: true` on the user and
  retry to see the denial or claims; compare the provider's issuer and redirect to what
  the app expects.
- Usual cause: an issuer or redirect-URI mismatch, or a policy denial.
- Fix: align the provider fields (→ providers).

### "It redirects in a loop after login"

- **[authentik]** First check: the provider's **Authorization flow** and **Redirect
  URIs**; for forward-auth, the **Cookie domain** and `authentik_host`.
- Usual cause: a redirect-URI/flow mismatch, or (forward-auth) a cookie/host misconfig.
- Fix: → providers for OIDC/SAML, → outposts for forward-auth.

### "Emails aren't sending"

- **[host]** First check: `ak test_email you@example.com` from the worker (Docker/K8s exec).
- Usual cause: SMTP host/port/auth wrong, or the host blocks outbound 25/587.
- Fix: correct **System → Settings** email config (or the per-stage settings), or use an
  external relay.

### "Forward-auth returns 401"

- **[vendor]** First check: `curl -v https://app.company/outpost.goauthentik.io/ping` →
  expect **HTTP 204**.
- Usual cause: the proxy isn't forwarding `/outpost.goauthentik.io/*`, or the outpost is
  misconfigured.
- Fix: → outposts (reverse-proxy wiring, trace logging).

### "CSRF error when saving"

- **[authentik]** First check: `/api/v3/admin/system/` → does `HTTP_HOST` match your
  domain (no port number)?
- Usual cause: a reverse proxy passing the wrong Host/Origin header.
- Fix: correct the proxy's Host/Origin forwarding.

### "It's slow / a task is stuck / the worker is unhealthy"

- **[authentik]** First check: **Dashboards → System Tasks** for failed or stuck tasks;
  then worker and Redis/PostgreSQL health.
- Usual cause: a wedged background task, or a saturated database/Redis.
- Fix: restart the worker; check DB/Redis connectivity and resource limits.
