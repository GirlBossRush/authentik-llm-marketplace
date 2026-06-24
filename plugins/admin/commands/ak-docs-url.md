---
description: Print the resolved authentik docs + integrations base URLs (from AK_AGENT_DOCS_URL / .env)
allowed-tools: Bash(node:*)
---

Resolved authentik documentation base URLs for this environment:

!`node "${CLAUDE_PLUGIN_ROOT}/plugins/admin/commands/environment/print-docs-url.ts"`

Relay the URLs above to the user verbatim.

If the docs base URL fell back to the default (`next.goauthentik.io`) but the user set `AK_AGENT_DOCS_URL` or `AK_DOCS_URL` in their `.env`, the resolver above reads the live `.env` directly, so a non-default value here confirms the file is being read. The SessionStart hook that injects this URL into a session's context only runs at session start — `/reload-plugins` does not replay it — so if a skill earlier in _this_ session used a different URL, start a fresh session (or `/clear`) to pick up the change.
