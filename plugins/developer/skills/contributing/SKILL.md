---
name: contributing
description: >
    Take a change from a branch to a pull request that's ready to merge: the branch and
    commit-title conventions, the PR template, what CI requires, and the (no-)CLA situation.
    Use when a contributor wants to open a pull request, name a commit or PR correctly,
    understand which checks must pass, or file a good issue. Getting community help lives in
    community; the local checks themselves in linting / testing.
---

# Contributing to authentik

## Purpose

Contributions land faster when they follow the project's conventions: issues that include
the version, reproduction, and logs maintainers need, and pull requests that meet the
commit, CI, and licensing expectations. This skill helps a contributor file a well-formed
issue and prepare a pull request that is ready for review.

## When to invoke

- "Submit a GitHub issue" / "report a bug" / "request a feature."
- "Open a pull request for my change."
- "What are the commit message / branch naming conventions?"
- "What does CI require before my PR can merge?"
- "Do I need to sign a CLA?"

Not this skill: getting usage help or asking the community a question (community), or the
local checks a PR must pass (linting, testing).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[verify]` confirm it
passes, `[pr]` act on GitHub, `[docs]` read the contributing guide.

### Take your branch to a ready-to-merge PR

**Result:** a pull request that follows the conventions and passes CI.

1. **[shell]** Work on a feature branch, never `main`: `git checkout -b feature/<short-name>`.
2. **[shell]** Name commits and the PR title `<package>: <verb> <description>` — for example
   `providers/oauth2: fix request parsing` or `web: add export button`.
3. **[verify]** Run the gate locally before pushing: `make all` (lint, build, test); if you
   touched models or the API, also `make gen` and commit the updated `schema.yml` and client
   packages.
4. **[pr]** Push the branch and open the PR; fill the template (what / why / how tested /
   linked issues, using `closes #N` to auto-close).
5. **[docs]** `website/docs/developer-docs/contributing.md`.

**Gotchas:** a PR from `main` is rejected — always use a feature branch; there is **no CLA**
(authentik is GPL-3.0), so contributions are simply under that license; the required checks
are the `ci-main` and `ci-web` jobs (lint, migrations, unit, integration, e2e, web
build/test), most of which `make all` covers locally.
**Verify:** the PR's CI is green and the title matches the convention.

### File a good issue

**Result:** a bug report or feature request a maintainer can act on.

- **[pr]** Use the issue templates; for a bug, include the authentik version, exact
  reproduction, expected vs actual behavior, and the relevant logs.

**Gotchas:** usage questions and "is this expected?" belong in community, not the issue
tracker.
**Verify:** the issue carries a version, a reproduction, and logs.
