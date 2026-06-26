---
name: frontend
description: >
    Run authentik's web UI against your local backend with hot reload, and build the
    production bundle. Covers starting the web dev server in watch mode, the build, and
    why your UI edits might not show up. Use when a contributor wants to run the
    frontend, rebuild the web UI after a change, or troubleshoot stale UI. The backend
    API it talks to lives in backend; first-time setup in dev-environment; the docs site
    in docs.
---

# authentik frontend development

## Purpose

The web frontend is a separate build that talks to the backend API. Working on it means
running the dev server in watch mode so changes rebuild automatically, and knowing how to
produce a production build when needed. This skill covers running and building the
frontend.

## When to invoke

- "Run the frontend dev server" / "start the web UI in watch mode."
- "Rebuild the web frontend after my changes."
- "My UI edits aren't showing up in the browser."
- "Point the frontend at a different backend."

Not this skill: the backend API the frontend calls (backend), the documentation site
(docs), or first-time setup (dev-environment).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[edit]` change code,
`[verify]` confirm it worked, `[docs]` read the developer docs. Commands run from the repo
root unless noted.

### Run the web UI with hot reload

**Result:** the web UI rebuilding on save, served by your local backend at `:9000`.

1. **[shell]** One-time: `make node-install` (sets up corepack and the Node toolchain).
2. **[shell]** Start watch mode: `make web-watch` (runs `npm run --prefix web watch`,
   which rebuilds on change). Keep your backend running (`make run`) in another terminal.
3. **[verify]** Edit a component and confirm the browser at `http://localhost:9000` picks
   it up.
4. **[docs]** `website/docs/developer-docs/setup/frontend-dev-environment.mdx`.

**Gotchas:** the frontend needs a backend at `:9000` — run `make run` alongside it; hot
reload needs `AUTHENTIK_DEBUG=true` (on by default in dev); built assets land in
`web/dist/` and must exist before the backend can serve the UI.
**Verify:** a visible change to a component shows up without a manual rebuild.

### Build the production web bundle

**Result:** a production build in `web/dist/`.

- **[shell]** `make web-build` (runs `npm run --prefix web build`).

**Gotchas:** run `make node-install` first if you haven't; the backend serves whatever is
in `web/dist/`, so rebuild after pulling web changes.
**Verify:** `web/dist/` is regenerated and the UI loads against `make run`.
