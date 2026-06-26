# authentik LLM Marketplace

A collection of [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) used by authentik idP.

## Installing

These skills work with any agent that supports the Agent Skills standard, including Claude Code, OpenCode, OpenAI Codex, and Pi.

### Claude Code

Install using the [plugin marketplace](https://code.claude.com/docs/en/discover-plugins#add-from-github):

```
/plugin marketplace add goauthentik/agent-marketplace
/plugin install ak-admin@authentik-marketplace
/plugin install ak-dev@authentik-marketplace
```

### Pi

Install from the Pi Marketplace or add manually via **Settings > Rules > Add Rule > Remote Rule (Github)** with `goauthentik/agent-marketplace`.

### npx skills

Install using the [`npx skills`](https://skills.sh) CLI:

```
npx skills add https://github.com/goauthentik/agent-marketplace
```

### Clone / Copy

Clone this repo and copy the skill folders from the plugin you want
(`plugins/admin/skills/` or `plugins/developer/skills/`) into the appropriate
directory for your agent:

| Agent        | Skill Directory              | Docs                                                                               |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| Claude Code  | `~/.claude/skills/`          | [docs](https://code.claude.com/docs/en/skills)                                     |
| Cursor       | `~/.cursor/skills/`          | [docs](https://cursor.com/docs/context/skills)                                     |
| OpenCode     | `~/.config/opencode/skills/` | [docs](https://opencode.ai/docs/skills/)                                           |
| OpenAI Codex | `~/.codex/skills/`           | [docs](https://developers.openai.com/codex/skills/)                                |
| Pi           | `~/.pi/agent/skills/`        | [docs](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#skills) |

## Commands

Commands are user-invocable slash commands that you explicitly call.

| Command        | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| `/ak-docs-url` | Print the resolved authentik docs + integrations base URLs (ak-admin) |

## Plugins

The marketplace ships two plugins. Install whichever fits your role.

| Plugin     | For                                        |
| ---------- | ------------------------------------------ |
| `ak-admin` | Administering a running authentik instance |
| `ak-dev`   | Contributing to authentik's source code    |

## Skills

Skills are contextual and auto-loaded based on your conversation. When a request matches a skill's triggers, the agent loads and applies the relevant skill to provide accurate, up-to-date guidance.

### ak-admin

| Skill                | Description                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `concepts`           | Translate a plain-language goal into the right authentik objects; explains the object model          |
| `applications`       | Connect a named app to authentik (SSO) end-to-end, and manage the Application object                 |
| `providers`          | Make an app trust authentik for login: OAuth2/OIDC, SAML, LDAP, RADIUS, proxy, outbound provisioning |
| `sources`            | Let users log in with Google/Microsoft/GitHub, or sync users in from Active Directory                |
| `flows-stages`       | Change login/signup/recovery: enrollment, password reset, captcha, MFA placement                     |
| `authenticators-mfa` | Turn on MFA: TOTP, WebAuthn/passkeys, Duo, SMS, and enforcing a second factor                        |
| `policies-rbac`      | Control who can use an app or reach a step; policies, bindings, and RBAC                             |
| `users-directory`    | Add or invite people, build groups, and issue service-account tokens                                 |
| `outposts`           | Run the proxy/LDAP/RADIUS/RAC outpost and wire forward-auth                                          |
| `events-monitoring`  | Alert on events (failed logins) and search the audit log                                             |
| `troubleshooting`    | Diagnose from the symptom: can't log in, token rejected, redirect loop, email, forward-auth 401      |
| `operations`         | Upgrade, recover a locked-out admin, rotate certs, brand the login page, back up and restore         |

### ak-dev

| Skill             | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `dev-environment` | Set up a local development stack from a fresh checkout            |
| `backend`         | Run the Django backend and worker; create and apply migrations    |
| `frontend`        | Run and build the web frontend                                    |
| `docs`            | Run and build the documentation site locally                      |
| `testing`         | Run the Python unit, e2e, and web test suites                     |
| `linting`         | Run linters, formatters, and type checkers across backend and web |
| `contributing`    | File a GitHub issue and prepare a pull request                    |
| `community`       | Find the right community channel and ask an effective question    |
| `de-slop`         | Removes AI-slop tells from human-facing text (issues, PRs, docs)  |

## MCP servers

Some skills are backed by an MCP server in [`mcp-servers/`](mcp-servers/). These ship Node code and need their dependencies installed before use.

| Server                                | Backs skill               | Tools                                                              |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| [`code-mode`](mcp-servers/code-mode/) | `ak-admin` (instance ops) | `search`, `execute`, `validate_blueprint`, `prepare_apply`, `docs` |

The repo's [`.mcp.json`](.mcp.json) registers them for plugin installs via `${CLAUDE_PLUGIN_ROOT}`. Dependencies (`node_modules`) are gitignored and resolved automatically:

- **Plugin install** — the `SessionStart` hook in [`hooks/hooks.json`](hooks/hooks.json) installs each server's runtime deps into the persistent `${CLAUDE_PLUGIN_DATA}` and symlinks them into place. Nothing to run.
- **Local dev** — the servers are npm workspaces; one `npm install` at the repo root installs everything.

See each server's README for auth and registration details.
