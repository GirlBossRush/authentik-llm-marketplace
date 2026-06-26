# Outcome-first admin skills

**Status:** approved design
**Date:** 2026-06-26
**Scope:** the `ak-admin` plugin (`plugins/admin/skills/*`). `ak-dev` is out of scope for this pass; a gap list is produced as a follow-up.

## Problem

The `ak-admin` skills are thin routers organized by authentik's object model: one skill per
object type (`providers`, `sources`, `flows-stages`, …). That structure serves someone who
already knows the model. It does not serve the two people who actually reach for an agent here.

**Persona 1 — the half-awake IT admin.** Reaches for an agent precisely so they do _not_ have to
sift docs or hunt through the admin dashboard. They want the outcome done on the instance, narrated
minimally — not a reading assignment.

**Persona 2 — the outcome-fluent, IdP-illiterate engineer.** Knows the outcome they want ("my team
logs into Grafana with their Google accounts") but lacks the vocabulary to name it. They don't know
that outcome decomposes into an Application, an OAuth2 Provider, a social Source, and a group
binding. Today they survive by keeping three browser tabs open — the authentik admin UI, the
integration guide, and the third-party vendor's own settings page — and paying the tax of switching
between them.

The shared enemy is **context-switching and the vocabulary gap**. The current skills address
neither: their descriptions are written in authentik jargon (so persona 2 never lands on the right
one), and their bodies route to docs without owning the end-to-end flow (so the three tabs stay
open).

## Goal

Make the agent the single pane of glass. It should:

1. Translate outcome-language into authentik's object model, so a vocabulary-poor request still
   routes to the right skill.
2. Pull the integration guide, the vendor-side steps, and the authentik-side changes into one
   continuous flow, so the user stops alt-tabbing.
3. For persona 1, drive the instance through code-mode rather than handing over docs to read.

### Non-goals

- No new skills. Every recipe has a natural home in an existing skill; adding parallel
  task-oriented skills would create routing ambiguity (two skills matching one query).
- No inlining of L1 reference material. Recipes carry sequence, routing, and gotchas — not field
  dictionaries. The live docs remain the source of truth for field-level specifics.
- No `ak-dev` changes this pass.
- No manifest or version changes. This is content-only; a version bump is a separate decision at
  ship time.

## Approach

Enrich the existing `ak-admin` skills in place (chosen approach 1 of three considered; the
alternatives were a parallel scenario-skill set — rejected for routing ambiguity and doubled
maintenance — and a single deep walkthrough engine — rejected as too narrow for "a variety of
common use cases").

The existing `applications` skill is **elevated into the walkthrough engine** rather than spawning a
new `connect-an-application` skill: it already claims ownership of "follow the integration catalog
for a specific service," so a second skill would collide with it. Net new skills: zero.

The three-layer model (L1 live docs / L2 skill / L3 code-mode) is preserved. The new content is L2.

### The recipe template

Every recipe added to a skill follows one shape, so neither persona has to re-orient between them.
The defining feature is that **each step is tagged by where it happens** — this is what collapses the
three tabs into one narrated flow.

```
### <Outcome in the user's own words>
**Result:** one plain-language sentence describing what they will have when done.

1. [authentik] <action>
   - Half-awake admin: code-mode proposes the change (validate_blueprint -> prepare_apply),
     and you run the printed `ak apply_blueprint` command to commit.
   - In the UI: <exact admin-dashboard navigation>.
2. [vendor]    <exactly what to enter on the third-party side>
3. [docs]      Fetch the <service> integration guide via llms.txt for field-level specifics.

**Gotchas:** the two or three things that cause most support tickets.
**Verify:** how to confirm the outcome end-to-end.
```

The `[authentik]` / `[vendor]` / `[docs]` tags are the keystone. They let the agent run one
continuous procedure instead of making the user track which tab a step belongs to.

Both action paths appear in every `[authentik]` step, clearly split: the code-mode propose-then-apply
path for persona 1, and exact admin-UI navigation for persona 2. This honors code-mode's propose-only
security model — code-mode never writes; it proposes a blueprint the operator applies with
`ak apply_blueprint`.

### Description rewrites — the vocabulary bridge

Every admin skill's `description` is rewritten to **lead with outcome-language**, then name the
authentik objects. A vocabulary-poor engineer never searches "provider"; they say "I want SSO for my
app." The description is the only text the agent sees before deciding to load a skill, so the trigger
phrasings must be in the user's words.

Example (`providers`):

- Before: "Configure Providers, where authentik acts as the identity provider and an application
  trusts it…"
- After: "Make an app trust authentik for login so users sign in once (SSO) — log into Grafana,
  Nextcloud, GitLab, and similar with their authentik account. This is the 'Provider' side…"

`concepts` additionally gains an **outcome-to-object translation table** — persona 2's Rosetta Stone,
living in the conceptual router where it belongs:

| The user says                                          | authentik object               |
| ------------------------------------------------------ | ------------------------------ |
| "log in _with_ Google / Microsoft / GitHub"            | Source (social)                |
| "this app should _trust_ authentik for login"          | Provider + Application         |
| "_push_ / sync my users into Google Workspace / Entra" | outbound provisioning Provider |
| "_protect_ an app that has no login of its own"        | Proxy provider + Outpost       |
| "_pull_ users in from Active Directory"                | Source (LDAP) + directory sync |

## Recipe catalog

Roughly 40 recipes across 12 skills. The spec covers the whole table; the implementation plan
sequences a marquee-first **wave 1** so the highest-traffic outcomes land before the long tail.

| Skill                         | Recipes                                                                                                                                                                                     | Wave                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **applications** _(flagship)_ | Connect-a-named-service walkthrough (detect service → fetch guide → authentik via code-mode → dictate vendor side); restrict who can launch an app; "app missing from dashboard" diagnostic | **1** / 2 / 2             |
| **providers**                 | Provider-type decision tree; OIDC for an app; SAML for an app; Proxy / forward-auth for a no-SSO app; outbound SCIM provisioning (Google Workspace / Entra)                                 | 2 / 2 / 2 / 2 / 2         |
| **sources**                   | Add Google / Microsoft / GitHub social login; sync users from Active Directory (LDAP source + directory sync); social-vs-protocol decision                                                  | **1** / 2 / 2             |
| **flows-stages**              | Self-service enrollment; password recovery (email); add captcha / consent / email-verify step; username + password on one page; flow-pattern decision guide                                 | **1** / **1** / 2 / 2 / 2 |
| **authenticators-mfa**        | Enforce MFA at login (enrollment + validation stage); require MFA for specific apps only; authenticator-type decision                                                                       | **1** / 2 / 2             |
| **policies-rbac**             | Policy-type decision tree; restrict app to a group; time-of-day / geo restriction; require MFA via policy binding                                                                           | 2 / **1** / 2 / 2         |
| **users-directory**           | Invite users (single + bulk); create a group and assign membership; service account for API access                                                                                          | 2 / 2 / 2                 |
| **outposts**                  | Deploy a proxy outpost (Docker / K8s) for forward-auth; embedded-vs-external decision; forward-auth troubleshooting                                                                         | 2 / 2 / 2                 |
| **events-monitoring**         | Notification rule + transport; find an event in the audit log; alert on failed logins                                                                                                       | 2 / 2 / 2                 |
| **operations**                | Safe upgrade; admin / password recovery; certificate add / rotate; brand the login page; backup and restore                                                                                 | 2 / 2 / 2 / 2 / 2         |
| **troubleshooting**           | Symptom-based decision tree (can't log in / token rejected / redirect loop / emails / forward-auth 401)                                                                                     | 2                         |
| **concepts**                  | Outcome-to-object translation table                                                                                                                                                         | **1**                     |

**Wave 1 (marquee, highest traffic):** applications/connect-a-service; sources/Google + Microsoft
social login; flows-stages/enrollment + recovery; policies-rbac/restrict-to-group;
authenticators-mfa/enforce-MFA; concepts/translation table.

**Wave 2:** the remainder of the table.

## Cross-cutting fixes

- **`execute_write` drift.** Several skills' "Working against authentik" block tells the agent to use
  `execute_write` (confirmed) to change the instance. That tool does not exist — code-mode is
  propose-only. Every occurrence is corrected to the real path: `search` / `execute` to read, then
  `validate_blueprint` → `prepare_apply` → the operator runs `ak apply_blueprint`. Confirmed present
  in `applications`, `providers`, and `flows-stages`; sweep all 12 skills.
- **Length budget.** Soft cap of ~150 lines / ~6KB per skill (the `de-slop` skill is ~12KB, so
  there is headroom). Stay single-file, matching the current convention.
- **README sync.** The `ak-admin` skill table in `README.md` mirrors each skill's description by
  hand; update it to match the rewrites. Check `AGENTS.md` for any description that drifts.

## Success criteria

- A request phrased purely as an outcome ("let my team log into Grafana with Google"), using no
  authentik vocabulary, routes to the correct skill via its description.
- Each wave-1 recipe lets the agent carry a user from outcome to verified result without the user
  opening the integration guide or vendor docs themselves — every step is tagged `[authentik]`,
  `[vendor]`, or `[docs]`, and `[authentik]` steps give both the code-mode and the admin-UI path.
- No recipe reproduces L1 field reference; each routes to the live integration guide for specifics.
- No skill references `execute_write`.
- `npm run lint` passes (prettier formats the new Markdown; eslint is unaffected).
- `README.md` descriptions match the rewritten skill descriptions.

## Risks

- **Doc duplication / staleness.** A recipe that inlines field values rots when authentik changes.
  Mitigation: recipes carry sequence + gotchas + a `[docs]` pointer, never field dictionaries.
- **Skill bloat.** Recipes lengthen each skill. Mitigation: the length budget, and keeping recipes
  to the common path rather than exhaustive branches.
- **Routing ambiguity from richer descriptions.** Two skills could match a borderline query.
  Mitigation: each description keeps its "Not this skill, use X" hand-offs, sharpened for the new
  outcome phrasings.

## Follow-up (not this pass)

A short written list of `ak-dev` gaps, for a later pass. No `ak-dev` edits now.
