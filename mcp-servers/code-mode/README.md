# authentik code-mode MCP server

Exposes authentik's API to an agent as **code**, not as hundreds of tools:

- `search(query)` — find API operations (path/summary/tags) with their schemas.
- `execute(code)` — run JS with a **read-only** `ak.request(method, path, { query, body })`.
- `execute_write(code[, confirm])` — run JS with write access; two-step confirm.

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

## Writes

`execute_write` is two-step: call once with `{ code }` to get a confirm token
and a preview of the code, then call again with `{ code, confirm }` (the same
code) to run it with a write-enabled client. `execute` itself is GET-only.
