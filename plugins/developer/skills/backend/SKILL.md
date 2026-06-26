---
name: backend
description: >
    Run authentik's Django backend while you work on it, and take a model change all the
    way to a committed migration. Covers starting the server and background worker (with
    hot reload), opening a Django shell, running `ak` management commands, and the
    makemigrations → migrate loop. Use when a contributor wants to run the backend dev
    server, generate or apply migrations, or run a management command. First-time setup
    lives in dev-environment; the web UI in frontend; the test suites in testing.
---

# authentik backend development

## Purpose

The backend is the Django server plus a background worker. Day-to-day backend work means
running those processes and keeping the database schema in sync: generating a migration
when a model changes, then applying it. This skill covers running the backend and the
migration loop.

## When to invoke

- "Run the backend dev server."
- "Run migrations" or "apply the latest migrations."
- "I changed a model — how do I generate a migration?"
- "Start the worker" or "my background tasks aren't processing locally."
- "Run a Django management command against my local instance."

Not this skill: first-time environment setup (dev-environment), the web UI server
(frontend), or running the test suites (testing).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[edit]` change code,
`[verify]` confirm it worked. Commands run from the repo root.

### Run the backend (server + worker)

**Result:** the API/web server and the worker running locally, restarting on edits.

1. **[shell]** Start both: `make run` (runs `uv run ak allinone`, server and worker in
   one process) on `http://localhost:9000`.
2. **[shell]** For auto-restart on edits: `make run-watch` (needs `watchexec`; restarts on
   `.py` / `.rs` / `.go` changes).

**Gotchas:** `ak allinone` runs the server and worker together; for separate processes use
`ak server` / `ak worker`; the web UI needs `make web-build` first (see dev-environment).
**Verify:** `http://localhost:9000` serves the UI and background tasks process.

### Take a model change to a committed migration

**Result:** a migration file matching your model change, applied locally and ready to
commit.

1. **[edit]** Change the model in `authentik/<app>/models.py`.
2. **[shell]** Generate the migration: `uv run ak makemigrations <app>` (e.g. `core`);
   it writes `authentik/<app>/migrations/NNNN_*.py`.
3. **[verify]** Read the generated file to confirm it matches your intent.
4. **[shell]** Apply it: `make migrate`.
5. **[verify]** Confirm CI will pass: `make ci-lint-pending-migrations` (runs
   `ak makemigrations --check`, which fails if a model change has no migration). Then
   commit the migration alongside the model change.

**Gotchas:** CI blocks a PR whose models have no migration, so run the `--check` before
pushing; if two branches add the same migration number, rename one and re-run
`makemigrations`; never edit an applied migration, add a new one instead.

### Run a management command or Django shell

**Result:** an `ak` command or an interactive shell against your local instance.

- **[shell]** `uv run ak shell` for an interactive Django shell; `uv run ak <command>` for
  any management command (for example `uv run ak check`).

**Gotchas:** run after `make migrate` so the schema matches the code.
**Verify:** the command runs without an `ImproperlyConfigured` error.
