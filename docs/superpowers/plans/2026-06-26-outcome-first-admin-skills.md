# Outcome-first admin skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the `ak-admin` skills so an agent can carry either persona — the half-awake IT admin or the outcome-fluent, IdP-illiterate engineer — from a plain-language outcome to a verified result without making them juggle the authentik admin UI, the integration guide, and the vendor's settings page.

**Architecture:** Enrich the 12 existing `ak-admin` skills in place — no new skills. Each skill gets (1) an outcome-first `description` rewrite for relevance routing, (2) a "Common workflows" section of recipes following one shared template whose steps are tagged `[authentik]` / `[vendor]` / `[docs]`, and (3) the `execute_write` drift fixed to the real propose-only path. The flagship is `applications`, elevated into the connect-a-named-service walkthrough engine.

**Tech Stack:** Markdown skills (`SKILL.md` with YAML frontmatter). Verification is `npm run lint` (prettier) + a per-task content checklist + a final `de-slop` skill sweep. No build, no unit tests — this is content.

> **Adaptation note (content, not code):** There is no automated test for "does this prose route / read correctly." Each task's gate is: `npm run lint` passes **and** the Content Checklist (Global Constraints) holds. Recipe prose MUST be written against live docs during the task (every content task starts with a docs-consult step) — do not fabricate exact UI strings or field values from memory; they go stale and the recipe's whole job is to route to L1 for those.

## Global Constraints

- **Branch:** all work on `skills/outcome-first-recipes` (already created; the design spec is already committed there).
- **Scope:** `plugins/admin/skills/*` only. No `ak-dev` edits. No new skills. No manifest/version changes.
- **Three-layer model preserved:** recipes are L2 (sequence, routing, gotchas, verification). Never inline L1 field dictionaries — route to the live docs/integration guide for field-level specifics.
- **Length budget:** soft cap ~150 lines / ~6KB per `SKILL.md`. Single file. If a skill would blow the budget, trim recipes to the common path, not exhaustive branches.
- **Commits:** conventional-commit subject; one commit per task. End every commit message with the two trailers:
    ```
    Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_012AmUVNvZDR4LE5KLS2aGys
    ```
- **De-slop:** prose is written cleanly, but the dedicated de-slop sweep (Task 15) is the gate over every changed file. Do not consider the feature done until Task 15 passes.

### Canonical recipe template (every recipe matches this)

```
### <Outcome, in the user's own words>
**Result:** <one plain-language sentence of what they'll have.>

1. **[authentik]** <action>
   - _Half-awake admin:_ code-mode proposes it (`validate_blueprint` → `prepare_apply`); run the printed `ak apply_blueprint` command to commit.
   - _In the UI:_ <exact admin-dashboard navigation>.
2. **[vendor]** <exactly what to enter on the third-party side.>
3. **[docs]** Fetch the <service/topic> guide via `llms.txt` for the field-level specifics.

**Gotchas:** <the 2–3 things that cause most support tickets.>
**Verify:** <how to confirm the outcome end-to-end.>
```

Not every recipe has a `[vendor]` step (internal-only flows like enrollment don't); keep the tags that apply. Every `[authentik]` step shows **both** paths (half-awake admin via code-mode, and in-the-UI navigation).

### Canonical exemplar (the voice & format all recipes match)

```
### Let my team log into Grafana with their authentik accounts
**Result:** Grafana shows a "Log in with authentik" button; authentik handles the password and hands Grafana the user's identity and role.

1. **[docs]** Resolve the integration guide: fetch `<integrations>/llms.txt`, find the entry for the named service (here, Grafana), and fetch its `.md`. It is laid out as _Preparation_ (placeholders), _authentik configuration_, and _<service> configuration_ — drive the first against the instance, dictate the second to the user.
2. **[authentik]** Create the Application + Provider pair:
   - _Half-awake admin:_ code-mode proposes an `authentik_core.application` + `authentik_providers_oauth2.oauth2provider` Blueprint; run the printed `ak apply_blueprint` to commit.
   - _In the UI:_ Applications → Applications → **Create with wizard**; choose **OAuth2/OpenID Connect**; add a **Strict** redirect URI matching the app's callback (`https://grafana.company/login/generic_oauth`); select a **Signing Key**; note the **Client ID** / **Client Secret**.
3. **[vendor]** In Grafana, set the generic-OAuth env vars (`GF_AUTH_GENERIC_OAUTH_*`) with the client ID/secret and authentik's authorize/token/userinfo URLs from the guide.
4. **[authentik]** _(optional)_ Add Application entitlements to map authentik users/groups onto Grafana roles.

**Gotchas:** the redirect URI must match the app's callback exactly; omitting a signing key breaks OIDC token signing; entitlement names must match Grafana's `role_attribute_path`.
**Verify:** open Grafana's login page, click the authentik button, confirm you land logged in with the expected role.
```

### Canonical "Working against authentik" block (replaces the `execute_write` drift everywhere)

```
## Working against authentik

authentik changes between releases — prefer live sources over memory:

- **Docs:** use the authentik docs base URL from your session context (or the
  `authentik-code-mode` MCP's `docs` tool, which returns the version-accurate
  URLs for this instance), then fetch `<docs>/llms.txt` (integrations:
  `<integrations>/llms.txt`), follow the index to the right page, and fetch its `.md`.
- **The instance:** use the `authentik-code-mode` MCP. `search` for the API
  operation, then `execute` to read the current state. code-mode never writes —
  to change the instance, `validate_blueprint` then `prepare_apply` a Blueprint,
  which returns the exact `ak apply_blueprint` command for you to run. Learn the
  concept from the docs first.
```

`concepts` uses a "Finding the docs" block (no instance writes); leave its shape but confirm it carries no `execute_write` reference.

### Content Checklist (the per-task gate, alongside `npm run lint`)

- [ ] `description` leads with outcome-language (a vocabulary-poor user's words), then names the authentik objects, and keeps a sharpened "Not this skill, use X" hand-off.
- [ ] Each recipe has the template's parts: outcome heading, **Result**, tagged steps, **Gotchas**, **Verify**.
- [ ] Every step is tagged `[authentik]` / `[vendor]` / `[docs]`; every `[authentik]` step shows both the code-mode path and the in-UI path.
- [ ] No `execute_write` anywhere; "Working against authentik" matches the canonical block.
- [ ] No inlined L1 field dictionary; specifics are routed to via `llms.txt`.
- [ ] File is within the length budget.

---

## Task 1: Flagship — `applications` (the connect-a-service walkthrough)

**Files:**

- Modify: `plugins/admin/skills/applications/SKILL.md`

**Interfaces:**

- Consumes: the recipe template, exemplar, and canonical "Working against authentik" block from Global Constraints.
- Produces: the canonical voice & format every later skill task matches; the connect-a-service walkthrough that `providers`/`sources` recipes can hand off to.

- [ ] **Step 1: Consult live docs.** Fetch `<integrations>/llms.txt` and skim 2–3 guides (e.g. Grafana, Nextcloud) to confirm the shared guide layout (Preparation / authentik configuration / <service> configuration). Fetch `<docs>/llms.txt` → applications + bindings pages for the launch/entitlement/binding nav.
- [ ] **Step 2: Rewrite the description.** Replace verbatim:
    ```yaml
    description: >
        Connect a specific named app or service to authentik so its users sign in
        with their authentik account (SSO) — "integrate Grafana", "put Nextcloud
        behind SSO", "set up GitLab login", "add Proxmox to authentik". This is the
        walkthrough engine: it finds the service's integration guide and drives both
        sides — the authentik Application/Provider and the settings to paste on the
        vendor — so the user never juggles tabs. Also owns the Application object
        itself: launch URL, icon, provider binding, who is allowed to launch it, and
        application entitlements. The protocol details live in providers; external
        login *into* authentik lives in sources.
    ```
- [ ] **Step 3: Fix the `execute_write` drift.** Replace the "Working against authentik" block with the canonical version.
- [ ] **Step 4: Add the "Common workflows" section** with three recipes following the template:
    - **Let my team log into <named service> with their authentik accounts** (wave 1) — the connect-a-service walkthrough. Use the canonical exemplar, generalized: Step 1 `[docs]` resolves the guide by service name; the rest drives Application+Provider via code-mode / UI and dictates the vendor side. Gotchas: exact redirect URI, signing key, entitlement/role mapping. Verify: log in via the app.
    - **Restrict who can launch an app** (wave 2) — Result: only the chosen group/users see and can launch the app. `[authentik]` create a binding (group/policy) on the Application; both paths. `[docs]` bindings overview. Gotchas: policy-engine mode (any vs all); a hidden app is not the same as a denied provider. Verify: a non-member cannot launch it. Hand off depth to `policies-rbac`.
    - **My app isn't showing on the user dashboard** (wave 2) — Result: the app appears for the right users. `[authentik]` check: is the Application bound to the user/group? is the provider authorization flow set? both paths to inspect via code-mode (`execute` read) / UI. Gotchas: binding vs launch URL blank; provider not assigned. Verify: it appears for a member. Hand off deeper diagnosis to `troubleshooting`.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass (prettier reformats the file if needed; re-stage).
- [ ] **Step 6: Content Checklist.** Walk the checklist above against the file; fix any miss.
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/applications/SKILL.md
    git commit -m "feat(skills): elevate applications into the connect-a-service walkthrough"
    ```

---

## Task 2: `concepts` — the outcome→object translation table

**Files:**

- Modify: `plugins/admin/skills/concepts/SKILL.md`

**Interfaces:**

- Consumes: nothing new.
- Produces: the vocabulary bridge other skills assume exists (persona 2's Rosetta Stone).

- [ ] **Step 1: Consult live docs.** Confirm the current object glossary via `<docs>/llms.txt` → core/glossary + add-secure-apps overview, so the table's mappings are accurate for this release.
- [ ] **Step 2: Rewrite the description** to lead with "what do these authentik words mean / which object do I actually need for what I want," keeping the conceptual+navigational framing and the "for building, hand off to X" line.
- [ ] **Step 3: Confirm no `execute_write`.** `concepts` has a "Finding the docs" block, not the instance block — verify it is clean; no change if so.
- [ ] **Step 4: Add the translation table** under a new "## From outcome to object" heading:
    ```markdown
    | The user says                                          | authentik object                                       |
    | ------------------------------------------------------ | ------------------------------------------------------ |
    | "log in _with_ Google / Microsoft / GitHub"            | Source (social)                                        |
    | "this app should _trust_ authentik for login"          | Provider + Application                                 |
    | "_push_ / sync my users into Google Workspace / Entra" | outbound provisioning Provider                         |
    | "_protect_ an app that has no login of its own"        | Proxy provider + Outpost                               |
    | "_pull_ users in from Active Directory"                | Source (LDAP) + directory sync                         |
    | "force a second factor / MFA"                          | Authenticator stage in a Flow, often gated by a Policy |
    ```
    Each row links to the skill that builds it.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist** (table rows route to a skill; description leads with outcome-language).
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/concepts/SKILL.md
    git commit -m "feat(skills): add outcome-to-object translation table to concepts"
    ```

---

## Task 3: `sources` — social login & directory sync (wave 1)

**Files:**

- Modify: `plugins/admin/skills/sources/SKILL.md`

**Interfaces:**

- Consumes: recipe template + exemplar voice from Task 1.
- Produces: recipes the `flows-stages` enrollment recipe can reference (the identification-stage source binding).

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → users-sources/sources: social-logins (Google, Entra/Microsoft, GitHub) and protocols/ldap + directory-sync. Confirm the identification-stage binding nav.
- [ ] **Step 2: Rewrite the description.** Lead with "let users log in _with_ an account they already have (Google, Microsoft, GitHub) or pull users in from Active Directory/LDAP" — i.e. login _into_ authentik — then name Sources; keep the "for an app trusting authentik, use providers" hand-off.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Add Google as a login option** (wave 1) — `[vendor]` create OAuth credentials in Google Cloud console (client ID/secret, redirect = authentik source callback); `[authentik]` create the Google social Source (both paths) and bind it on the identification stage; `[docs]` the Google social-login guide. Gotchas: redirect/callback URL must match; the source must be added to the identification stage or no button appears. Verify: the login page shows "Log in with Google."
    - **Add Microsoft / Entra ID as a login option** (wave 1) — same shape against Entra app registration. Gotchas: tenant restriction; admin consent for the requested scopes.
    - **Add GitHub as a login option** (wave 2) — same shape against a GitHub OAuth app.
    - **Sync users in from Active Directory** (wave 2) — `[vendor]` an AD service account + base DN; `[authentik]` create an LDAP Source and run/schedule directory sync (both paths); `[docs]` the LDAP source + directory-sync pages. Gotchas: bind DN permissions; sync is scheduled, not instant; group mapping. Verify: synced users appear under Directory.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/sources/SKILL.md
    git commit -m "feat(skills): add social-login and directory-sync recipes to sources"
    ```

---

## Task 4: `flows-stages` — enrollment & recovery (wave 1)

**Files:**

- Modify: `plugins/admin/skills/flows-stages/SKILL.md`

**Interfaces:**

- Consumes: template/voice from Task 1; references `sources` (identification stage) and `authenticators-mfa` (MFA stages).
- Produces: the flow-pattern vocabulary `authenticators-mfa` and `policies-rbac` recipes reference.

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → customize/flows-stages: flow designations, identification/password/user_login/email/prompt stages, and the enrollment + recovery flow examples.
- [ ] **Step 2: Rewrite the description.** Lead with "change what happens during login/signup/recovery — add a captcha, a consent or email-verification step, build a self-service signup or password-reset, combine username+password onto one page" then name Flows/Stages/bindings; keep the MFA-enrollment → `authenticators-mfa` hand-off.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Build a self-service enrollment (signup) flow** (wave 1) — `[authentik]` create a Flow with the _enrollment_ designation, chain identification → prompt (user fields) → password → user_write → user_login stages (both paths); `[docs]` the enrollment example. Gotchas: the enrollment flow must be linked from the identification stage's "Enrollment flow"; user_write before user_login. Verify: a logged-out user can sign up and land authenticated.
    - **Add a password-reset / recovery flow** (wave 1) — `[authentik]` create a Flow with the _recovery_ designation: identification → email (verification) → prompt (new password) → user_write (both paths); `[vendor]` none, but requires a working email transport (hand off to `operations`/`events-monitoring`); `[docs]` the recovery example. Gotchas: email transport must be configured or the link never sends; link the recovery flow from the identification stage. Verify: "Forgot password" sends a mail and resets.
    - **Add a captcha / consent / email-verification step** (wave 2) — `[authentik]` insert the stage via an ordered stage binding (both paths). Gotchas: binding order; captcha keys. Verify: the step appears in the flow.
    - **Put username and password on one page** (wave 2) — `[authentik]` set the identification stage to also prompt for password (both paths). Gotchas: which stage owns the password field. Verify: one combined page renders.
    - **Decision guide: which flow pattern** — a short "designation → when to use" table (authentication, enrollment, recovery, unenrollment, configuration). No vendor side.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/flows-stages/SKILL.md
    git commit -m "feat(skills): add enrollment, recovery, and flow-pattern recipes"
    ```

---

## Task 5: `authenticators-mfa` — enforce MFA (wave 1)

**Files:**

- Modify: `plugins/admin/skills/authenticators-mfa/SKILL.md`

**Interfaces:**

- Consumes: flow vocabulary from Task 4; hands MFA-gating-by-policy to Task 6.
- Produces: the "validation stage" recipe `policies-rbac` references.

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → authenticator stages (TOTP, WebAuthn/passkeys, email, static, Duo) + the authenticator_validate stage.
- [ ] **Step 2: Rewrite the description.** Lead with "require a second factor / passkey / authenticator app at login, let users enrol a phone or security key, turn on MFA" then name the device types; keep the "the flow plumbing itself → flows-stages" hand-off.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Require MFA for everyone at login** (wave 1) — `[authentik]` add an authenticator_validate stage to the authentication flow and an enrollment stage so users can register a device (both paths); `[docs]` the validate-stage page. Gotchas: without an enrollment path users get locked out; choose which device classes are accepted. Verify: a user without a device is forced to enrol, then prompted each login.
    - **Require MFA only for specific apps** (wave 2) — bind the validation as a policy on the Application/flow; hand off the binding mechanics to `policies-rbac`. Gotchas: app-scoped vs global. Verify: MFA prompts for the gated app only.
    - **Decision guide: which authenticator** — TOTP vs WebAuthn/passkey vs email vs Duo, one line each on when to pick it.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/authenticators-mfa/SKILL.md
    git commit -m "feat(skills): add MFA-enforcement recipes to authenticators-mfa"
    ```

---

## Task 6: `policies-rbac` — restrict access (wave 1) — completes wave 1

**Files:**

- Modify: `plugins/admin/skills/policies-rbac/SKILL.md`

**Interfaces:**

- Consumes: binding references from Tasks 1, 5.
- Produces: the policy decision tree the whole catalog hands off to.

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → customize/policies: expression, reputation, geoip, password-expiry, and policy bindings; plus the RBAC roles/permissions pages.
- [ ] **Step 2: Rewrite the description.** Lead with "control who can use an app or reach a step — limit to a group, block by location or time of day, require MFA, defend against brute force, give an admin role" then name Policies/bindings/RBAC.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Decision guide: which policy type** — reputation → brute-force defence; expression → time/geo/custom logic; geoip → location; password-expiry → compliance; group/user binding → membership. One line each.
    - **Restrict an app to a specific group** (wave 1) — `[authentik]` bind the group to the Application (both paths); `[docs]` bindings overview. Gotchas: policy-engine mode any vs all; binding on the Application vs the provider's flow. Verify: a non-member is denied.
    - **Restrict by time of day or location** (wave 2) — `[authentik]` an expression or geoip policy bound to the app/flow (both paths). Gotchas: server timezone; GeoIP database must be present. Verify: access blocked outside the window/region.
    - **Require MFA via a policy** (wave 2) — bind so the validation stage runs only when the policy matches; cross-link `authenticators-mfa`. Verify: MFA prompts only when the condition holds.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/policies-rbac/SKILL.md
    git commit -m "feat(skills): add policy decision tree and access-restriction recipes"
    ```

---

## Task 7: `providers` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/providers/SKILL.md`

**Interfaces:**

- Consumes: connect-a-service flagship (Task 1) hands the protocol depth here.
- Produces: protocol decision tree referenced by `applications` and `outposts`.

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → add-secure-apps/providers: oauth2, saml, proxy, ldap, radius, scim, gws, entra.
- [ ] **Step 2: Rewrite the description.** Lead with "make an app trust authentik for login (SSO) — Grafana, Nextcloud, GitLab — or expose LDAP/RADIUS, protect a no-SSO app via forward-auth, or push users out to Google Workspace/Entra" then name the protocols; keep the "login _into_ authentik → sources" hand-off.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Decision guide: which provider type** — app speaks OIDC → OAuth2; speaks SAML → SAML; has no SSO → Proxy + Outpost; needs LDAP bind → LDAP; network/VPN → RADIUS; push users out → SCIM/GWS/Entra. One line each.
    - **Set up OIDC SSO for an app** (wave 2) — `[authentik]` OAuth2/OpenID provider + Application (both paths); `[vendor]` client ID/secret + redirect; `[docs]` the app's integration guide. Gotchas: strict redirect URI, signing key, scopes. Verify: login round-trips.
    - **Set up SAML SSO for an app** (wave 2) — `[authentik]` SAML provider (ACS URL, issuer, signing cert) + Application (both paths); `[vendor]` upload metadata / set ACS; `[docs]` the guide. Gotchas: ACS URL and entityID exact match; clock skew; signing cert. Verify: SP-initiated login works.
    - **Protect an app that has no SSO (forward-auth)** (wave 2) — `[authentik]` Proxy provider + Application (both paths); hand the runtime to `outposts`; `[docs]` proxy/forward-auth page. Gotchas: external host config; outpost must be running. Verify: hitting the app redirects to authentik then back.
    - **Provision users out to Google Workspace / Entra** (wave 2) — `[authentik]` the GWS/Entra provider + property mappings (both paths); `[vendor]` service-account/credentials on the target; `[docs]` the GWS/Entra pages. Gotchas: scoped credentials; mapping attributes; sync is scheduled. Verify: a user appears in the target directory.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/providers/SKILL.md
    git commit -m "feat(skills): add provider decision tree and protocol recipes"
    ```

---

## Task 8: `outposts` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/outposts/SKILL.md`

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → outposts: docker/k8s deployment, embedded vs external, and forward-auth troubleshooting.
- [ ] **Step 2: Rewrite the description.** Lead with "run the piece that actually guards a proxied app, an LDAP/RADIUS endpoint, or remote-desktop access" then name the outpost runtimes; keep the "the Proxy/LDAP/RADIUS provider itself → providers" hand-off.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Deploy a proxy outpost for forward-auth** (wave 2) — `[vendor]` run the outpost container (Docker/K8s) with the outpost token + authentik host; `[authentik]` create the Outpost and attach the Proxy provider (both paths); `[docs]` the deployment page. Gotchas: token/host env; the provider must be attached; reverse-proxy must forward auth headers. Verify: the outpost shows healthy and the app gates correctly.
    - **Embedded vs external outpost** (wave 2) — a short decision: embedded for quick/simple, external for scale/isolation.
    - **Forward-auth returns 401 / loops** (wave 2) — `[authentik]` check provider attachment + external host; `[vendor]` check the reverse proxy's auth_request wiring; cross-link `troubleshooting`.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/outposts/SKILL.md
    git commit -m "feat(skills): add outpost deployment and forward-auth recipes"
    ```

---

## Task 9: `users-directory` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/users-directory/SKILL.md`

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → users-sources: user management, groups, invitations; sys-mgmt/service-accounts.
- [ ] **Step 2: Rewrite the description.** Lead with "add or invite people, put them in groups, hand out an API/service account" then name users/groups/roles/invitations; keep RBAC depth → `policies-rbac`.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Invite a user (single or bulk)** (wave 2) — `[authentik]` create an invitation tied to an enrollment flow (both paths); `[docs]` invitations page. Gotchas: invitation requires an enrollment flow; single-use vs reusable. Verify: the invite link enrols a user.
    - **Create a group and assign membership** (wave 2) — `[authentik]` create the group, add members (both paths). Gotchas: superuser groups grant admin. Verify: members inherit the group's bindings.
    - **Create a service account for API access** (wave 2) — `[authentik]` create the service account + token (both paths); `[docs]` service-accounts page. Gotchas: scope the token's permissions; treat the token as a secret. Verify: the token authenticates an API call.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/users-directory/SKILL.md
    git commit -m "feat(skills): add invitation, group, and service-account recipes"
    ```

---

## Task 10: `events-monitoring` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/events-monitoring/SKILL.md`

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → sys-mgmt/events: logging, notification rules, transports.
- [ ] **Step 2: Rewrite the description.** Lead with "get told when something happens (failed logins, new admin, errors), or find what happened in the audit log" then name events/notifications/transports.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Get notified on an event (e.g. failed logins)** (wave 2) — `[authentik]` create a notification rule + a transport (email/webhook) bound to the trigger (both paths); `[docs]` notifications page. Gotchas: rule needs a group to notify + a transport; email needs a working mail config. Verify: trigger it and confirm the message arrives.
    - **Find a specific event in the audit log** (wave 2) — `[authentik]` query events via code-mode `execute` / the Events view, filter by action/user (both paths). Verify: the event is located with its context.
    - **Alert on suspicious activity** (wave 2) — bind a rule to login-failure / reputation events; cross-link `policies-rbac` reputation.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/events-monitoring/SKILL.md
    git commit -m "feat(skills): add notification and audit-log recipes"
    ```

---

## Task 11: `operations` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/operations/SKILL.md`

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → install-config/upgrade, sys-mgmt: certificates, brands, backup-restore; the admin recovery path.
- [ ] **Step 2: Rewrite the description.** Lead with "keep the instance running — upgrade safely, recover a locked-out admin, rotate a certificate, brand the login page, back up and restore" then name the lifecycle areas.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add recipes:**
    - **Upgrade authentik safely** (wave 2) — `[vendor/host]` back up first, read the release notes, bump the image/chart, run migrations (both paths where code-mode can read version); `[docs]` upgrade page. Gotchas: back up before upgrading; check breaking changes; server + worker on the same version. Verify: version reports new, login works.
    - **Recover a locked-out admin** (wave 2) — `[host]` run the recovery command/key to mint an admin login; `[docs]` admin recovery page. Gotchas: requires host/CLI access; the link is time-limited. Verify: you can log in as admin.
    - **Add or rotate a certificate** (wave 2) — `[authentik]` create/import a keypair and assign it to the provider/brand (both paths). Gotchas: assign the new cert before retiring the old; SAML/OIDC signing impact. Verify: the new cert serves.
    - **Brand the login page** (wave 2) — `[authentik]` set a Brand's logo/title/flows + custom CSS (both paths). Gotchas: brand matches by domain; default brand fallback. Verify: the branded page renders for the domain.
    - **Back up and restore** (wave 2) — `[host]` database + media backup and the restore procedure; `[docs]` backup-restore page. Gotchas: back up media + secret key, not just the DB. Verify: a restore round-trips on a scratch instance.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist.**
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/operations/SKILL.md
    git commit -m "feat(skills): add upgrade, recovery, cert, branding, and backup recipes"
    ```

---

## Task 12: `troubleshooting` (wave 2)

**Files:**

- Modify: `plugins/admin/skills/troubleshooting/SKILL.md`

- [ ] **Step 1: Consult live docs.** `<docs>/llms.txt` → troubleshooting: login, access, forward-auth, emails, CSRF, LDAP.
- [ ] **Step 2: Rewrite the description.** Lead with the symptoms in the user's words — "I can't log in", "the app rejects the token", "it redirects in a loop", "emails aren't sending", "forward-auth returns 401" — then name the diagnostic areas.
- [ ] **Step 3: Fix `execute_write`** → canonical block.
- [ ] **Step 4: Add a symptom-based decision tree** — for each symptom: the first thing to check (`[authentik]` via code-mode `execute` read / UI, or `[vendor]`), the usual cause, and the skill to hand off to for the fix. Symptoms: can't log in; token rejected by app; redirect loop; email not sending; forward-auth 401; CSRF error. Keep it a routing tree, not a fix-dump.
- [ ] **Step 5: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 6: Content Checklist** (a troubleshooting tree may have no `[vendor]` step on some branches — that's fine).
- [ ] **Step 7: Commit.**
    ```bash
    git add plugins/admin/skills/troubleshooting/SKILL.md
    git commit -m "feat(skills): add symptom-based diagnostic tree to troubleshooting"
    ```

---

## Task 13: Sync `README.md` and `AGENTS.md`

**Files:**

- Modify: `README.md` (the `### ak-admin` skill table)
- Modify: `AGENTS.md` (only if any description it quotes drifted)

- [ ] **Step 1:** For each of the 12 admin skills, update its one-line description in the `README.md` `ak-admin` table to match the rewritten `description` (condensed to one line, outcome-first).
- [ ] **Step 2:** Grep `AGENTS.md` for any skill description text that now drifts; update if found. (`AGENTS.md` mostly describes structure, so likely no change — confirm.)
- [ ] **Step 3: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 4:** Verify each README row still reads as one tight line and the table renders.
- [ ] **Step 5: Commit.**
    ```bash
    git add README.md AGENTS.md
    git commit -m "docs: sync README skill table with outcome-first descriptions"
    ```

---

## Task 14: Write the `ak-dev` gap list (follow-up, no edits)

**Files:**

- Create: `docs/superpowers/notes/2026-06-26-ak-dev-gaps.md`

- [ ] **Step 1:** Skim the 9 `ak-dev` skills and note, per skill, the most valuable outcome-oriented recipe it currently lacks (e.g. `dev-environment`: "from zero to a running stack" end-to-end; `testing`: "run just the test touching my change"). Keep it a short bulleted list — a backlog, not a spec.
- [ ] **Step 2: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 3: Commit.**
    ```bash
    git add docs/superpowers/notes/2026-06-26-ak-dev-gaps.md
    git commit -m "docs: note ak-dev skill gaps for a later pass"
    ```

---

## Task 15: De-slop sweep over every changed file (the quality gate)

**Files:**

- Modify: any of the 12 `SKILL.md`, `README.md`, `AGENTS.md`, and the new notes/spec/plan docs that the de-slop audit flags.

- [ ] **Step 1:** List every file changed on the branch: `git diff --name-only main...HEAD`.
- [ ] **Step 2:** Invoke the repo's `de-slop` skill (`plugins/developer/skills/de-slop/SKILL.md`) and run its audit against each changed human-facing file. This is parallelizable — one file per reviewer — since de-slop is per-file. Rewrite (don't patch) every flagged item.
- [ ] **Step 3:** Re-run the de-slop audit on the rewritten text until zero hits.
- [ ] **Step 4: Lint.** Run: `npm run lint`. Expected: pass.
- [ ] **Step 5: Commit** (only if de-slop changed anything).
    ```bash
    git add -A
    git commit -m "style(skills): de-slop the new admin skill content"
    ```

---

## Task 16: Open the PR

- [ ] **Step 1:** Push the branch: `git push -u origin skills/outcome-first-recipes`.
- [ ] **Step 2:** Open a PR into `main` with `gh pr create`, summarizing the two-persona goal, the recipe template, the wave-1/wave-2 split, and the `execute_write` fix. Body ends with the Claude Code attribution footer.
- [ ] **Step 3:** Confirm CI (`Lint, typecheck & test`) goes green on the PR; the branch-protection gate requires it before merge.

---

## Self-Review

**Spec coverage:**

- Outcome-first descriptions → every content task Step 2. ✓
- Recipe template with `[authentik]`/`[vendor]`/`[docs]` tags + both action paths → Global Constraints + every recipe. ✓
- `concepts` translation table → Task 2. ✓
- ~40-recipe catalog, marquee-first → Tasks 1–12; wave 1 = Tasks 1–6, completes at Task 6. ✓
- `execute_write` drift swept across all 12 → Step 3 of each content task (concepts verified clean). ✓
- README sync → Task 13. ✓
- Length budget, no-inline-L1, three-layer model → Global Constraints + Content Checklist. ✓
- De-slop on all new files → Task 15 (the user's explicit gate). ✓
- `ak-dev` gap list, no edits → Task 14. ✓
- Lint passes → every task's lint step + success criteria. ✓

**Placeholder scan:** Recipe prose is intentionally generated against live docs during each task (a deliberate content-work choice, stated up front), not a hand-wave — each task names the exact docs to consult and the must-cover gotchas, and Global Constraints carries a fully-worked exemplar. Descriptions are verbatim. No "TBD"/"similar to Task N"/"add error handling" left.

**Type consistency:** The tag vocabulary (`[authentik]`/`[vendor]`/`[docs]`), the canonical "Working against authentik" block, the recipe template, and the wave labels are defined once in Global Constraints and referenced unchanged by every task.
