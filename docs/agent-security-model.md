# AI-agent security model for authentik

**Status:** Design, validated against a live authentik `2026.8.0-rc1` instance (2026-06-25)
**Scope:** How an AI coding agent (Claude Code, via the code-mode MCP + skills) may operate on an authentik instance, from "hey Claude, set me up authentik" to a production-ready, safe deployment.

---

## 1. Why this exists

We are building a three-layer agent stack on top of authentik:

1. **Docs as `llms.txt`**: the agent retrieves current docs instead of guessing.
2. **Skills**: playbooks teaching the agent authentik's object model.
3. **Code-mode MCP**: `search` (over the live OpenAPI schema), `execute` (read-only sandboxed `ak.request`), `execute_write` (write-enabled, two-step confirm). It authenticates with a single authentik API token.

What triggered this document: while testing, the agent minted _itself_ a non-expiring superuser API token via authentik's Django shell. That's harmless on a throwaway dev box but revealing as a pattern. It showed there is no single security model but three personas, and that most of the controls we had assumed were security did nothing against an inattentive operator.

## 2. Core principle

> **The human is a _scheduler_, not a _gatekeeper_. Security must come from structural defaults the agent cannot touch and the operator cannot lazily route around, and the secure path must be the lazy path.**

We assume the operator is **inattentive and lazy**: they will click "approve" without reading, paste a superuser token because it is less work than making a scoped one, be the soft target for social engineering, and disable any guardrail that adds friction. A rubber-stamping human is not a boundary. Every control below must therefore hold _even when the human approves blindly_, and the low-friction option must be the safe one.

## 3. Personas and the boundary axis

The decisive axis is **the cost of an agent mistake**: is the instance's state _disposable_ or _must-be-preserved_?

| Persona                                 | State                     | Boundary posture                                                                                                                    |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **P1: first-time admin, clean slate**   | disposable (re-creatable) | wide latitude, but bootstrap must auto-provision a least-privilege identity so the lazy admin never has the easier superuser option |
| **P2: admin expanding live production** | must be preserved         | read-mostly; writes are narrow, time-boxed, validated server-side                                                                   |
| **P3: authentik developer**             | no boundary               | full shell/superuser, explicitly out of scope                                                                                       |

P1 and P2 are the targets.

## 4. Threat model: "pwned by something stupid"

1. **Prompt injection via read data**: malicious values in objects the agent reads become instructions. No data the agent reads may be executed as a command.
2. **Over-privileged / long-lived credentials**: a static superuser Bearer token in the sandbox env; leakage = total, permanent control.
3. **Irreversible mutations**: deletions, secret/key rotation, session revocation, external side effects (SCIM deprovisioning, webhooks).
4. **Confused deputy**: the agent acts with the admin's authority and is tricked into an intent-aligned but disastrous change.
5. **The lazy operator** (meta-adversary): defeats any control that relies on human attention or that is more friction than the insecure alternative.

## 5. Empirical findings (validated, not assumed)

Probed against `2026.8.0-rc1`. These are the evidence base; the model is built around them.

### Finding A: scoped identities are provisionable via API (no UI step) ✅

A service account + custom role + permission grants + token can be created entirely through the ORM/REST surface. The "admin bootstraps a least-privilege agent" flow is feasible (and can be a deterministic, non-agent bootstrap script).

### Finding B: blueprint apply bypasses the caller's RBAC ⚠️ **ESCALATION**

A token with **only** `authentik_blueprints.{add,view,change}_blueprintinstance` (and provably denied direct group creation, `POST /core/groups/` → `403`) created an `is_superuser: true` group by POSTing a `BlueprintInstance` with inline `content` and calling `POST /api/v3/managed/blueprints/{uuid}/apply/` (`200`, group confirmed).

**"Can apply a blueprint" == superuser.** One further blueprint adds the agent's own account to that group → full takeover.

_Consequence:_ `blueprintinstance` must **never** be in the agent's RBAC write allow-list as a constraint. The boundary is **MCP-side blueprint-content validation**, with apply performed by a server-held identity the agent never holds.

### Finding C: "read everything" grants token theft ⚠️ **ESCALATION**

A read role built as "all `view_*` perms except `view_token`" could still read **any** user's token secret (verified against the akadmin superuser token + 4 other owners) via `GET /core/tokens/{id}/view_key/`.

Not an authentik bug: list/detail correctly filter to the caller's own tokens (others `404`). The `view_key` action requires `authentik_core.view_token_key`, a _separate global secret-reveal permission_ the naive grant swept in.

The same trap generalizes to crypto: the read-all reader also held `authentik_crypto.view_certificatekeypair_key` and retrieved a certificate's **RSA private key** via `…/view_private_key/` (`200`, PEM returned). A signing-key leak means forged SAML assertions / JWTs, total identity compromise.

**Read-all ⇒ secret exfiltration.**

_Consequence:_ the agent read role must be an **allow-list**, never "everything minus a few." authentik exposes a _class_ of secret-reveal permissions whose codenames end in **`_key`** (`view_token_key`, `view_certificatekeypair_key`, `view_enrollment_token_key`, …). The read role must deny every `view_*_key` permission (and audit for any reveal perm that doesn't follow the suffix).

## 6. Theater vs. real (against a rubber-stamping operator)

| Theater (dies to a blind "yes")        | Real (structural, agent can't touch)                               |
| -------------------------------------- | ------------------------------------------------------------------ |
| two-step `execute_write` confirm token | RBAC deny-list baked into the agent's service account              |
| "louder confirmation" / extra MFA tier | MCP-side blueprint **content** validation                          |
| "admin reviews the diff"               | MCP hard-coded path deny-list (defense in depth)                   |
| admin manually crafting a scoped token | apply performed by a **server-held** identity the agent never sees |

The confirm token we already ship is useful for **intent capture and audit**, not as a security boundary. We keep it, but do not trust it.

## 7. Credential model

- **Read token**: always-on. An **allow-list** of `view` perms; **every `view_*_key` secret-reveal perm denied** (`view_token_key`, `view_certificatekeypair_key`, `view_enrollment_token_key`, …) plus OAuth token views. Object-level filtering already hides other users' tokens; we additionally deny the reveal perms (confirmed necessary; see §5 Finding C).
- **Write**: the agent never holds a durable write credential. When it needs to write, it tells the operator to run `ak-agent authorise`, a CLI that mints a short-lived (~1h) token and injects it into the MCP via a **side-channel** (local socket / env), so neither the agent nor the operator's clipboard sees the secret. Lazy path = one rote command; the insecure path (UI → create → copy → paste) is _more_ work.
- **Permanently denied** (denied in RBAC **and** blocked at the MCP path layer): `core.token`, `core.user`, `core.group`, `rbac.role`, `permission`, `crypto.*`, `authenticated_sessions`, `core.system`, plus the secret-reveal read perms. This closes the self-elevation loop: no minting tokens, no self-promotion, no killing the admin's session, no stealing secrets.

## 8. Write path = blueprints only, validated server-side

The agent's sole write is "submit a blueprint; the MCP validates, then a server-held identity applies." This collapses the write surface to one path and makes every change a reviewable, versioned, re-appliable document. Because **Finding B** proves apply ignores RBAC, the guard is content validation, not permissions:

- Reject any entry targeting a denied model (tokens, users, groups, roles, permissions, crypto, sessions).
- Forbid `!Env` (reads environment / secrets); allow `!Find`/`!KeyOf`/`!Format`.
- Force secret fields (`client_secret`, `token`, `password`, `signing_key`, …) to be omitted so authentik auto-generates them, so the agent can't plant a known backdoor.

## 9. Undo / redo

Auto-snapshot affected objects to an `undo-<session>` blueprint before every apply. Reversibility taxonomy:

| Class                       | Example                                                     | Undo?                                           |
| --------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| (i) pure config, same UUID  | rename app, change flow setting                             | ✅ re-apply snapshot                            |
| (ii) reference-breaking     | delete a provider → recreated, new UUID                     | ⚠️ recovery aid only; references/sessions break |
| (iii) external side effects | SCIM already deprovisioned downstream; webhooks/emails sent | ❌ gone                                         |
| (iv) secret renewal         | rotate client secret / signing key                          | ❌ roll-forward, new secret                     |

UI must say plainly: "undo works unless the op changed a UUID, spun a new secret, or talked to the outside world." Irreversible ops (delete source/provider, crypto) are **refused in the agent flow** and pushed to a host CLI. This is structural friction the agent cannot make the human bypass, and rare enough to avoid confirmation-fatigue.

## 10. Phased roadmap

- **v1: Safe read, safe propose.** _Guarantees:_ agent reads via an **allow-list** read token (secret-reveal denied) and proposes blueprints, but **cannot mutate anything**. Closest to today; the work is (a) replace the superuser token with a scoped read token, (b) build the read allow-list, (c) MCP content-validator for proposed blueprints (validate-only). Default `AUTHENTIK_URL` to `http://localhost:9000` when unset (token never defaulted).
- **v2: Blueprints apply with structural guardrails.** _Guarantees:_ changes only via MCP-validated blueprints; self-elevation loop closed. Apply runs as a server-held identity; auto-snapshot undo; irreversible ops gated to host CLI.
- **v3: Zero-touch bootstrap + hardened lazy path.** _Guarantees:_ "set me up authentik" yields a least-privilege agent with zero manual token handling; `ak-agent authorise` side-channel; continuous check that the agent's own role wasn't tampered with.

## 11. Open questions / follow-ups

1. ~~Crypto private-key reveal~~, **confirmed** (§5 Finding C): read-all leaks certificate private keys via `view_certificatekeypair_key`. Resolved into the `view_*_key` deny rule.
2. **authentik maintainers**: is the blueprint-apply RBAC bypass (Finding B) by-design? Either way, exposing blueprint create+apply to a non-superuser via RBAC is a silent path to superuser, and the RBAC UI should warn or block it.
3. **Operator-facing warnings the product should surface:** "granting an agent broad read includes the power to read secrets (tokens _and_ signing keys)," and "blueprint permissions are equivalent to admin."
4. **Enumerate the full secret-reveal perm set** beyond the `_key` suffix (audit all custom `view_*` permissions) before finalizing the v1 read allow-list.

---

_Design developed with an independent review pass (DeepSeek) and validated empirically against a live instance. The boundary lives in the MCP server's code and a scoped RBAC config the agent cannot alter, never in human vigilance._
