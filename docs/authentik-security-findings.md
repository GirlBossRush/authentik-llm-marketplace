# authentik security findings (triaged)

Two authorization findings surfaced while building the AI-agent layer and probing how to scope an agent's access. Both reproduced on a local **authentik `2026.8.0-rc1`** instance, and both have since been **triaged by an authentik maintainer (Jens)**.

> **Status:** Neither is an unpatched vulnerability to disclose.
> **Finding 1 is intended** behavior (blueprint change access is superuser-equivalent by design).
> **Finding 2 is not intended**, but authentik already ships a correct read-only role that avoids it — a footgun with an existing mitigation, not an open hole.
> Kept here as design rationale for the agent security model (`docs/agent-security-model.md`).

---

## Finding 1: Blueprint apply runs with full privileges (intended)

**Maintainer verdict:** **Intended** — if you have blueprint change access, you are effectively superuser. Not an advisory.

### Behavior

Blueprint application runs with full privileges regardless of the requesting user's RBAC. A user/service account holding only `authentik_blueprints.{add,view,change}_blueprintinstance` — and _explicitly denied_ creating privileged objects directly — can create and apply a `BlueprintInstance` whose contents create those objects (e.g. an `is_superuser: true` group).

### Reproduction (for the record)

1. Create a service account + a role granting **only** `authentik_blueprints.{add,view,change}_blueprintinstance`. Do **not** grant `authentik_core.add_group`.
2. Direct path is denied: `POST /api/v3/core/groups/ {"name":"x","is_superuser":true}` → `403`.
3. Via a blueprint, the same token succeeds:
    ```
    POST /api/v3/managed/blueprints/   { "name":"escalate", "enabled":true,
      "content":"version: 1\nentries:\n  - model: authentik_core.group\n    identifiers: {name: pwned-superusers}\n    attrs: {is_superuser: true}" }
    POST /api/v3/managed/blueprints/{instance_uuid}/apply/   → 200 OK
    ```
4. The `is_superuser: true` group is created; a second entry adding the SA to it completes takeover.

### Takeaway for the agent layer

This is exactly why the agent must **never** be granted `blueprintinstance` write/apply via RBAC. The boundary is the MCP server: validate blueprint _content_, and (in v2) apply via a separate server-held identity the agent never possesses. The agent's own read token has no blueprint write.

### Optional upstream hardening (not a bug)

Surface in the RBAC UI/docs that blueprint permissions are superuser-equivalent, so an operator delegating "blueprint management" understands the scope.

---

## Finding 2: Broad `view` grants silently include secret-reveal permissions (not intended; mitigated by a shipped role)

**Maintainer verdict:** **Not intended** — _but_ authentik ships a read-only role that does this correctly. The issue only bites if you hand-roll a read-only role instead of using the official one.

**Severity:** Low in practice (a shipped mitigation exists), High if you ignore it and grant "all view perms" yourself.

### Behavior

authentik defines per-model **secret-reveal** permissions whose codenames end in `_key`, _separate_ from the model's `view_<model>` permission:

- `authentik_core.view_token_key` → reveals an API token's value (`GET /core/tokens/{id}/view_key/`)
- `authentik_crypto.view_certificatekeypair_key` → reveals a certificate's **private key** (`GET /crypto/certificatekeypairs/{id}/view_private_key/`)
- `authentik_endpoints_connectors_agent.view_enrollment_token_key`, etc.

A role built as "all `view_*` permissions" silently includes these. The role can then read **every** API token secret and **every** certificate private key in the instance (verified: returned the akadmin superuser token value and a certificate's RSA private key). This is RBAC working as designed — list/detail correctly filter to owned tokens; the reveal actions require the `_key` perm, which the broad grant swept in.

### The mitigation (use this)

authentik ships **`blueprints/default/rbac-role-read-only.yaml`** → role **`authentik Read-only`**, which builds its permission set with:

```yaml
permissions:
    !Enumerate [
        !Context goauthentik.io/rbac/models,
        SEQ,
        !Format ["%s.view_%s", !Value 0, !Index 0],
    ]
```

i.e. only the per-model `view_<model>` permission for every model — so secret-reveal perms are excluded **by construction** (they aren't `view_<model>` for any model), and the role stays correct as new models are added.

Our agent bootstrap (`scripts/provision-agent-identity.py`) assigns this official role rather than computing an allow-list by codename heuristic. Live-verified: `apps=200`, `view_key=403`, `view_private_key=403`.

### Optional upstream hardening (not a bug)

Flag `view_*_key` secret-reveal perms as a distinct, high-sensitivity category in the RBAC UI with a warning on grant, and keep them out of any "view all" preset — so a hand-rolled read role can't include them by accident.

---

_Found while designing a least-privilege boundary for an AI agent operating authentik; see `docs/agent-security-model.md` for how the agent layer defends against both._
