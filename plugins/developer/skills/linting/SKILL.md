---
name: linting
description: >
    Fix everything before you push, and reproduce a failing CI lint or type check locally.
    Covers the all-in-one format-and-fix, the backend tools (black, ruff, mypy, bandit) and
    the web tools (eslint, prettier, tsc, lit-analyse), and matching what CI enforces. Use
    when a contributor wants to format code, run the type checker, auto-fix issues, or
    resolve a failing lint/type check. Running tests lives in testing; PR conventions in
    contributing.
---

# authentik linting and type checking

## Purpose

Before a change can merge it has to pass the same lint, format, and type checks CI runs.
Those span two languages with different tools. This skill runs the linters and type
checkers, applies autofixes where possible, and reproduces a CI check failure locally so it
can be fixed in advance.

## When to invoke

- "Run the linter" / "run the formatter."
- "Run the type checker."
- "Auto-fix lint and formatting issues."
- "A lint or type check is failing in CI — how do I reproduce and fix it?"

Not this skill: running tests (testing) or PR submission conventions (contributing).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[verify]` confirm it
passes, `[docs]` read the CI definition. Commands run from the repo root unless noted.

### Fix everything before pushing

**Result:** code formatted and auto-fixed across backend and web, matching CI.

1. **[shell]** Backend: `make lint-fix` (black + `ruff --fix`), then `make lint` (the checks
   CI runs: ruff, `mypy --strict`, bandit, plus the Go and Rust linters).
2. **[shell]** Web: `cd web/ && npm run lint && npm run prettier && npm run tsc && npm run lit-analyse`.

**Gotchas:** run `make lint-fix` before `make lint`: the fixer changes code, then the
checker verifies it; mypy is `--strict`, so new code must be fully typed (or carry a
justified `# type: ignore`); the backend tools cover
`authentik packages tests scripts lifecycle .github`.
**Verify:** `make lint` and the web checks pass clean.

### Reproduce a failing CI lint or type check

**Result:** you run the exact check CI failed on, locally.

- **[shell]** Match the job: backend type errors → `uv run mypy --strict <paths>`; ruff →
  `uv run ruff check <paths>`; web type errors → `cd web && npm run tsc`; formatting →
  `npm run prettier-check`.
- **[docs]** the lint jobs in `.github/workflows/ci-main.yml` and `ci-web.yml` list every
  tool.

**Gotchas:** if you touched models or the API, CI also regenerates the schema and clients, so
run `make gen` and commit the updated `schema.yml` and client packages (the migration side
is in backend).
**Verify:** the local command reproduces, then clears, the CI failure.
