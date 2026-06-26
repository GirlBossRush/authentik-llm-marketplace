---
name: flows-stages
description: >
    Change what happens during login, signup, or recovery. Use when a user wants to
    build a self-service signup or a password-reset flow, add a captcha, consent, or
    email-verification step, put username and password on one page, or reorder the
    steps of login. Covers Flows, the Stages bound to them, and the policy bindings
    that decide whether a stage runs. MFA enrollment specifics live in
    authenticators-mfa; the social-login button's upstream config lives in sources.
---

# authentik flows and stages

## Purpose

Flows are authentik's login and lifecycle pipelines; Stages are the individual steps
inside them, attached by ordered bindings. Almost every "I want my login page to do X"
request is a flow-and-stage change. This skill builds and edits flows, adds and orders
stages, and attaches the policies that decide whether a stage runs.

## When to invoke

- "I want a captcha on my login page."
- "Put the password field on the same page as the username field."
- "Add an email verification / consent step to signup."
- "Build a self-service enrollment flow" or "a password recovery flow."
- "Change the order of steps during login" or "skip a stage for some users."

Not this skill: configuring the authenticator devices themselves
(authenticators-mfa), the policy expressions in depth (policies-rbac), or the external
login button's upstream config (sources).

## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** use the authentik docs base URL from your session context (or the
  `authentik-code-mode` MCP's `docs` tool, which returns the version-accurate
  URLs for this instance), then fetch `<docs>/llms.txt` (integrations:
  `<integrations>/llms.txt`), follow the index to the right page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP. `search` for the API
  operation, then `execute` to read the current state. code-mode never writes — to
  change the instance, `validate_blueprint` then `prepare_apply` a Blueprint, which
  returns the exact `ak apply_blueprint` command for you to run. Learn the concept
  from the docs first.

## Common workflows

Each step is tagged by **where it happens**: `[authentik]` in the instance, `[docs]`
in the live docs. Every `[authentik]` step gives both paths: the hands-off code-mode
propose, and the click-by-click admin UI.

### Build a self-service signup (enrollment) flow

**Result:** a logged-out visitor can create their own account and land logged in.

1. **[authentik]** Create the flow and its stages:
    - _Hands-off:_ code-mode proposes the flow + stage-binding Blueprint (or import an
      example such as `flows-enrollment-2-stage.yaml`); apply it.
    - _In the UI:_ **Flows and Stages → Flows → New Flow**, **Designation =
      Enrollment**; bind stages in order: **prompt** (collect username/email/name) →
      **password** → **user_write** (set **User creation mode = create**) →
      **user_login**.
2. **[authentik]** Link it so users can reach it: **Flows → default-authentication-flow
   → Stage Bindings** → edit **default-authentication-identification** → set the
   **Enrollment flow** field to your flow.
3. **[docs]** `<docs>` flows-stages/flow/examples for ready-made chains.

**Gotchas:** without a **user_write** stage the collected data is never saved; **User
creation mode = never** means no account is ever made; if the **Enrollment flow** field
is empty the signup link never shows.
**Verify:** open the login page logged out, follow "Sign up", finish authenticated.

### Add a password-reset (recovery) flow

**Result:** a "Forgot password?" link emails the user a reset link that sets a new
password.

1. **[authentik]** Create the flow: **New Flow**, **Designation = Recovery**; chain
   **identification → email** (sends the tokenized link) **→ prompt** (new password) **→
   user_write**. code-mode can propose this, or import
   `flows-recovery-email-mfa-verification.yaml`.
2. **[authentik]** Make sure email actually sends. The email stage uses the global
   SMTP config: **System → Settings** (or a per-stage override).
3. **[authentik]** Set it as the default: **System → Brands → [brand] → Default flows →
   Recovery flow**, and/or link it from the identification stage's **Recovery flow**
   field.
4. **[docs]** `<docs>` flows-stages/stages/email and the recovery example.

**Gotchas:** **no email transport means the link silently never sends** (check **System
Tasks** for failures); the **Recovery flow** must be set on the brand or the
identification stage, or the "Forgot password?" link won't appear.
**Verify:** click "Forgot password?", receive the mail, reset, and log in.

### Insert a captcha, consent, or email-verification step

**Result:** the chosen step runs at the right point in a flow.

- **[authentik]** Add the stage via an ordered **stage binding** on the flow (**Flows →
  [flow] → Stage Bindings → Create**) and set its **order** relative to the others.
  code-mode can propose the binding, or do it in the UI.
- **[docs]** the matching stage page for its fields (a captcha needs its site/secret
  keys).

**Gotchas:** **binding order** decides when it runs; a captcha needs its provider keys
set.
**Verify:** run the flow and confirm the step appears where you placed it.

### Put username and password on one page

**Result:** the user types both on a single screen instead of two.

- **[authentik]** Edit the **Identification** stage and enable its **password** field
  so it collects the password too, then make sure no separate password stage duplicates
  it.

**Gotchas:** decide which stage owns the password field — don't prompt for it twice.
**Verify:** the login page renders one combined username + password form.

### Which flow designation do I need?

| Goal                                    | Designation                         |
| --------------------------------------- | ----------------------------------- |
| Log existing users in                   | Authentication                      |
| Let people sign themselves up           | Enrollment                          |
| Reset a forgotten password              | Recovery                            |
| Let a user delete their own account     | Unenrollment                        |
| Collect or confirm settings mid-session | Configuration / Stage configuration |
