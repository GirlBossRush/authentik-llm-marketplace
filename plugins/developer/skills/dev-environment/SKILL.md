---
name: dev-environment
description: >
    Go from a fresh authentik clone to a running stack you can log into, or reset a
    broken environment to a known-good state. Covers the prerequisites, installing
    backend (Python/uv) and web (Node) dependencies, bringing up the supporting
    services via Docker Compose, generating local config, the initial migrations,
    building the web UI, and the first admin login. Use when a contributor is starting
    from scratch or their environment won't come up. Running a server once it's set up
    lives in backend / frontend / docs.
---

# authentik dev environment

## Purpose

A working authentik checkout needs several moving parts before anything runs: language
toolchains, dependency installs, a database and Redis, local configuration, a migrated
schema, and a built web UI. This skill walks a contributor from a fresh clone to a
running stack, and gets a broken environment back to a known-good state.

## When to invoke

- "Set up my local authentik development environment."
- "I just cloned authentik — how do I get it running?"
- "My dependencies / database / Redis won't come up."
- "How do I create the first admin user locally?"
- "Reset my local environment to a clean state."

Not this skill: running an individual server once the environment exists (backend,
frontend, docs) or running migrations as a routine task (backend).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[verify]` confirm it
worked, `[docs]` read the developer docs. Commands run from the repo root unless noted.

### From a fresh clone to first login

**Result:** authentik running locally at `http://localhost:9000` with an admin you can
sign in as.

1. **[shell]** Install the prerequisites: Python 3.14, `uv`, Node 24+, Go 1.26+, Docker and
   Docker Compose, plus the platform libraries (macOS: `libxmlsec1`, `libpq`, `krb5` via
   Homebrew; Debian: the `krb5` / `xmlsec` / `postgresql-server-dev` packages).
2. **[shell]** Bring up the supporting services and install dependencies:
    ```
    docker compose -f scripts/compose.yml up -d   # PostgreSQL and friends
    make install                                  # backend + web dependencies
    make gen-dev-config                           # local dev config
    make migrate                                  # initialize the database
    make web-build                                # build the web UI (needed before it renders)
    ```
3. **[shell]** Start the stack: `make run` (server + worker, via `uv run ak allinone`).
4. **[verify]** Open `http://localhost:9000` and set the password for the `akadmin` user.
5. **[docs]** `website/docs/developer-docs/setup/full-dev-environment.mdx` for the full
   prerequisite list and platform notes.

**Gotchas:** `make web-build` is required before the UI renders; if `esbuild` /
`chromedriver` fail to install (npm install-scripts are disabled by default for
security), run `npm rebuild --foreground-scripts esbuild chromedriver tree-sitter tree-sitter-json`;
the first run takes a moment to drain the task queue.
**Verify:** the login page loads and you can sign in as `akadmin`.

### Reset a broken environment to a clean state

**Result:** a fresh database and a known-good stack.

1. **[shell]** Reset the database: `make dev-reset` (drops, recreates, and migrates the
   dev database).
2. **[shell]** If dependencies have drifted, re-run `make install` and `make web-build`.
3. **[shell]** Start again with `make run`.

**Gotchas:** `make dev-reset` is destructive (it drops the dev database) and is dev-only;
always run migrations after pulling new commits, or you hit `ImproperlyConfigured`.
**Verify:** `make run` comes up and you can log in.
