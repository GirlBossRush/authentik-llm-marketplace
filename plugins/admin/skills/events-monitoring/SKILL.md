---
name: events-monitoring
description: >
    Get alerted when something happens, or find what already did. Use when someone
    wants an email or webhook on failed logins, a new admin, or a config change — or
    wants to look up what happened in the audit log: recent logins and failures, who
    changed a setting, when a user was created. Covers the event log and its AKQL
    search, plus notification rules and transports. Diagnosing *why* something is
    broken lives in troubleshooting; the event-matcher policy internals in policies-rbac.
---

# authentik events and monitoring

## Purpose

authentik records an event for security-relevant and operational activity:
authentications, failures, model changes, and system tasks. This skill queries that
event log to answer "what happened and when", and sets up notification rules bound to
event-matcher policies so the right people are alerted through the right transport.

## When to invoke

- "Show me the last 10 failed login attempts."
- "Show me the last 10 successful logins."
- "Who changed this provider / when was this user created?"
- "Alert me by email / webhook when an admin logs in or a policy fails."
- Questions about reading, filtering, or exporting the audit log.

Not this skill: diagnosing _why_ something is broken from logs and system health
(troubleshooting), or the event-matcher policy mechanics in depth (policies-rbac).

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

### Get notified when something happens (e.g. failed logins)

**Result:** the chosen people get a message through your transport when a matching
event fires.

1. **[authentik]** Build the three pieces, in order:
    - _In the UI:_ **Events → Notification Transports → New** (Email / Webhook /
      Slack-Discord); then **Customize → Policies → New → Event Matcher** (set the
      **Action**, e.g. `login_failed`); then **Events → Notification Rules → New**,
      binding that policy, picking the **transport**, and a **Destination group**.
    - _Hands-off:_ code-mode proposes the transport + matcher + rule Blueprint; apply it.
2. **[docs]** `<docs>` sys-mgmt/events/notifications and transports.

**Gotchas:** the **transport must exist before the rule** (no inline create); a rule
with **no Destination group** (and "send to event user" off) silently sends nothing;
`login_failed` carries the attempted name in **`context.username`**, not `user.username`.
**Verify:** trigger the event (e.g. a bad login) and confirm the message arrives.

### Find a specific event in the audit log

**Result:** you locate the exact event with its actor, IP, and context.

1. **[authentik]** Query it:
    - _In the UI:_ **Events → Logs**, with an AKQL query like
      `action = "login_failed" and context.username = "bob"`, or a date range like
      `created >= "2026-06-01"`.
    - _Hands-off:_ code-mode `execute` a read against the events API with the same filters.
2. **[docs]** `<docs>` sys-mgmt/events/logging-events and akql.

**Gotchas:** dates must be `YYYY-MM-DD` (or with `HH:MM`) or the query **silently falls
back to a substring search**; open-source shows action + model only, not field-level
diffs (Enterprise does).
**Verify:** the event appears with the expected user, IP, and time.

### Alert on suspicious activity

**Result:** repeated failures or risky logins raise a flag.

- **[authentik]** Either match the `login_failed` / `suspicious_request` actions with
  an Event Matcher bound to a notification rule, or add a **Reputation** policy to drop
  trust on repeated failures (pair with **policies-rbac**).

**Gotchas:** GeoIP/ASN context (`context.geo.country`, `context.asn`) is only populated
if those context processors are enabled.
**Verify:** simulate repeated failures and confirm the alert or reputation score reacts.
