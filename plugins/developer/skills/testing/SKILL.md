---
name: testing
description: >
    Run authentik's tests: just the ones touching your change, a single test while
    iterating, the full backend suite, the Selenium e2e suite, or the web tests. Use when
    a contributor wants to run the Python or web tests, narrow a run to one test, watch an
    e2e run in a browser, or work out why a suite won't start. Linting and type checks live
    in linting; the environment the tests need in dev-environment.
---

# authentik testing

## Purpose

authentik has several test layers: Python unit and integration tests, a browser-driven e2e
suite, and web frontend tests. Each has its own command and its own service prerequisites.
This skill runs the right suite, narrows a run to a single test while iterating, and sorts
out the setup a suite needs.

## When to invoke

- "Run the Python e2e tests."
- "Run the backend unit tests" or "run just this one test."
- "Run the web / frontend tests."
- "The e2e suite won't start" or "tests pass in CI but fail locally."

Not this skill: linting and type checking (linting), or setting up the environment the
tests run against (dev-environment, backend).

## Common workflows

Steps are tagged by what you're doing: `[shell]` run a command, `[verify]` confirm the
result. Commands run from the repo root unless noted.

### Run a single backend test while iterating

**Result:** one test, class, or module runs fast against the kept test database.

- **[shell]**
  `uv run coverage run manage.py test tests.authentik.core.tests.test_models.ModelTest.test_user_settings --keepdb`
  — drop the trailing `.test_...` to run the whole class, or pass a file path to run a
  module.

**Gotchas:** `--keepdb` reuses the test database (much faster on reruns); tests randomize
order (`pytest-randomly`), so pass `--randomly-seed=0` to make a debugging run deterministic.
**Verify:** the focused test passes.

### Run the full backend suite

**Result:** all backend tests with a coverage report.

- **[shell]** `make test` (runs the suite with coverage; CI adds `--parallel auto`).

**Verify:** green, and `htmlcov/index.html` holds the coverage report.

### Run the e2e (browser) suite, and watch it

**Result:** the Selenium-driven flow tests run, optionally visible in a browser.

1. **[shell]** Start the e2e services: `docker compose -f tests/e2e/compose.yml up -d`.
2. **[shell]** Run one: `uv run coverage run manage.py test tests.e2e.test_flows_login --keepdb`
   (or `tests/e2e/` for all).
3. **[verify]** Watch it live at `http://localhost:7900` (password `secret`).

**Gotchas:** e2e is slow because it drives a real browser. Run a specific test during dev,
not the whole suite; the e2e services must be up first.

### Run the web tests

**Result:** the frontend tests pass.

- **[shell]** `cd web/ && npm run test` (Vitest unit tests); `npm run test:e2e` (Playwright).

**Verify:** green locally before pushing; CI's `ci-web` runs the same.
