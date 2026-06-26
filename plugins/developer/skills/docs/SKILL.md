---
name: docs
description: >
    Preview an authentik docs change locally and build the site before you open a PR.
    Covers starting the Docusaurus dev server with live reload, the static build, and
    where the docs, integration guides, and API reference sources live. Use when a
    contributor edits a docs page and wants to see it, or to build and check the docs
    before submitting. The product web UI lives in frontend; the backend in backend.
---

# authentik documentation development

## Purpose

authentik's documentation is a site built from sources in the repository. To preview a
change, a contributor runs the docs server locally with live reload. This skill covers
starting that server, building the static output, and locating the source files behind the
docs, integration guides, and API reference.

## When to invoke

- "Start the docs server" / "preview the documentation locally."
- "I edited a docs page — how do I see it?"
- "Build the static documentation site."
- "Where does the source for this docs page live?"

Not this skill: the product web UI (frontend) or the backend that serves the API the docs
describe (backend).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[edit]` change a file,
`[verify]` confirm it worked. Commands run from the repo root.

### Preview a docs change with live reload

**Result:** the docs site at `http://localhost:3000` reloading as you edit.

1. **[shell]** One-time: `make docs-install`.
2. **[shell]** Start it: `make docs-watch` (runs `npm run --prefix website start`); open
   `http://localhost:3000`.
3. **[edit]** Edit the page under `website/docs/` (product docs) or `website/integrations/`
   (integration guides); the browser reloads.

**Gotchas:** run `make docs-install` first; Node 24+ is required; the site is a Docusaurus
v3 monorepo whose workspaces are `docs`, `api`, and `integrations`.
**Verify:** your edit appears at `http://localhost:3000`.

### Build and check the docs before a PR

**Result:** a clean static build and passing docs lint.

1. **[shell]** Build: `make docs-build` (the production build catches broken links and MDX
   errors).
2. **[shell]** Lint, format, and spellcheck: `make docs-lint-fix`.

**Gotchas:** the build fails on broken internal links and MDX errors, so fix them before
pushing; cspell may flag new terms, so add legitimate ones to the dictionary.
**Verify:** both run clean; CI's docs job mirrors them.
