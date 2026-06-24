---
name: troubleshooting
description: >
  Diagnose a broken or degraded authentik instance. Covers email/SMTP delivery
  failures, slow or unresponsive performance, worker and Celery task health,
  Redis and PostgreSQL connectivity, the System Tasks view, and reading server
  and worker logs to find a root cause. Use when something that should work
  doesn't — emails not arriving, the UI is slow, a background task is stuck — and
  the user needs a systematic diagnosis rather than a feature configuration.
---

# authentik troubleshooting

## Purpose

When authentik misbehaves, the cause is usually in a place the admin hasn't
looked: the worker, a failed system task, SMTP settings, or a saturated database.
This skill works from symptom to evidence to root cause — checking system tasks,
logs, and component health — instead of guessing at fixes. It complements the
read-only audit log skill by focusing on operational failure.

## When to invoke

- "Why is my authentik instance not sending emails?"
- "Why is authentik so slow?"
- "A background task is stuck / failing." (System Tasks)
- "The login page won't load" or "the worker keeps restarting."
- "Users report intermittent errors and I don't know where to start."

Not this skill: routine reading of the audit log (events-monitoring) or
lifecycle tasks like upgrades and admin recovery (operations), though a
diagnosis often ends by pointing at one of those.

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** start at <https://docs.goauthentik.io/llms.txt> (integrations live at
  <https://integrations.goauthentik.io/llms.txt>), follow the index to the right
  page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP — `search` for the API
  operation, then `execute` to read or `execute_write` (confirmed) to change.
  Learn the concept from the docs first.
