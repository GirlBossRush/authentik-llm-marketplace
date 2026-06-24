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
(`plugins/ak-admin/skills/` or `plugins/ak-dev/skills/`) into the appropriate
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

| Command | Description |
| ------- | ----------- |

## Plugins

The marketplace ships two plugins. Install whichever fits your role.

| Plugin     | For                                        |
| ---------- | ------------------------------------------ |
| `ak-admin` | Administering a running authentik instance |
| `ak-dev`   | Contributing to authentik's source code    |

## Skills

Skills are contextual and auto-loaded based on your conversation. When a request matches a skill's triggers, the agent loads and applies the relevant skill to provide accurate, up-to-date guidance.

### ak-admin

| Skill                | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `concepts`           | Explains the object model (Application vs Provider, Flow vs Stage) and routes docs questions |
| `applications`       | Application objects and the integration catalog for a specific service                       |
| `providers`          | authentik as the IdP: SAML, OAuth2/OIDC, LDAP, RADIUS, Proxy, SCIM                           |
| `sources`            | Login into authentik with external accounts and directory sync                               |
| `flows-stages`       | Login, enrollment, and recovery flows and the stages bound to them                           |
| `authenticators-mfa` | MFA and authenticator devices: TOTP, WebAuthn/passkeys, Duo, SMS                             |
| `policies-rbac`      | Authorization policies, bindings, and role-based access control                              |
| `users-directory`    | Users, groups, roles, and invitations                                                        |
| `outposts`           | Deploying the Proxy, LDAP, RADIUS, and RAC outpost runtimes                                  |
| `events-monitoring`  | Reading the audit log and configuring notifications                                          |
| `troubleshooting`    | Diagnosing email, performance, and worker/task failures                                      |
| `operations`         | Instance lifecycle: version, upgrades, admin recovery, certificates, brands                  |

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

| Server                                | Backs skill               | Tool                                 |
| ------------------------------------- | ------------------------- | ------------------------------------ |
| [`code-mode`](mcp-servers/code-mode/) | `ak-admin` (instance ops) | `search`, `execute`, `execute_write` |

The repo's [`.mcp.json`](.mcp.json) registers them for plugin installs via `${CLAUDE_PLUGIN_ROOT}`. Dependencies (`node_modules`) are gitignored and resolved automatically:

- **Plugin install** — the `SessionStart` hook in [`hooks/hooks.json`](hooks/hooks.json) installs each server's runtime deps into the persistent `${CLAUDE_PLUGIN_DATA}` and symlinks them into place. Nothing to run.
- **Local dev** — the servers are npm workspaces; one `npm install` at the repo root installs everything.

See each server's README for auth and registration details.
