# authentik code-mode MCP server

Exposes authentik's API to an agent as **code**, not as hundreds of tools:

- `search(query)` — find API operations (path/summary/tags) with their schemas.
- `execute(code)` — run JS with a **read-only** `ak.request(method, path, { query, body })`.
- `validate_blueprint(content)` — validate a proposed Blueprint YAML without applying it.
- `docs()` — version-aware docs URLs for this instance.

## Auth

Set two environment variables (the token carries your own permissions):

```bash
export AUTHENTIK_URL="https://id.example.com"
export AUTHENTIK_TOKEN="ak-…"   # Directory → Tokens → create
```

The server fetches `${AUTHENTIK_URL}/api/v3/schema/` at startup, so discovery
always matches your instance's version.

## Example

```
search({ query: "list failed logins events" })
execute({ code: `return (await ak.request("GET","/events/events/",{query:{action:"login_failed",ordering:"-created",page_size:10}})).data;` })
```

## Security (v1)

This server is **propose-only**: it does not hold or expose a write-capable credential. The agent cannot mutate anything in the instance.

- **Tools:** `search` (discovery), `execute` (read-only GET-only API calls), `validate_blueprint` (blueprint content validation only), `docs` (version-aware docs URLs).
- **Auth:** `AUTHENTIK_TOKEN` must be the scoped read-only token provisioned by `scripts/provision-agent-identity.py` — never a superuser token. If unset, `AUTHENTIK_URL` defaults to `http://localhost:9000`.
- **Read boundary:** The token's RBAC role denies all `view_*_key` secret-reveal permissions (tokens, certificate keys, etc.), preventing exfiltration of signing keys and API secrets. See `docs/agent-security-model.md` § 5–7 for threat model and design rationale.
- **Blueprint validation:** `validate_blueprint` is propose-only: the operator must apply validated blueprints themselves via the UI or CLI. The validation enforces content rules (denies models, forbidden tags, plaintext secrets) that prevent escalation and mutation.
