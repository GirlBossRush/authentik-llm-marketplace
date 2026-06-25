"""Provision a least-privilege read-only agent identity in authentik.

Run from the authentik checkout:  uv run ak shell < <path>/provision-agent-identity.py
Prints AUTHENTIK_READ_TOKEN=<key>; set that as the code-mode MCP's AUTHENTIK_TOKEN.

The agent is granted authentik's official, maintainer-shipped read-only role
("authentik Read-only", from the default blueprint "Default - RBAC - Read-only").
That role enumerates only the per-model `view_<model>` permission for every model,
so secret-reveal permissions (`view_token_key`, `view_certificatekeypair_key`, …)
are excluded *by construction* — not by a fragile codename heuristic — and it stays
correct upstream as authentik adds models. See agent-security-model.md §5/§7.
"""

from authentik.core.models import Group, Token, TokenIntents, User, UserTypes
from authentik.rbac.models import Role

SA, GRP, TOK = "ak-agent", "ak-agent-grp", "ak-agent-read-tok"
READONLY_ROLE = "authentik Read-only"

try:
    role = Role.objects.get(name=READONLY_ROLE)
except Role.DoesNotExist as exc:
    raise SystemExit(
        f"Required role '{READONLY_ROLE}' not found. It ships in the default blueprint "
        "'Default - RBAC - Read-only'; ensure default blueprints have been applied to this instance."
    ) from exc

sa, _ = User.objects.update_or_create(
    username=SA, defaults=dict(name="authentik agent (read-only)", type=UserTypes.SERVICE_ACCOUNT)
)
grp, _ = Group.objects.update_or_create(name=GRP)
grp.roles.set([role])  # authoritative: the agent group carries ONLY the official read-only role
sa.ak_groups.add(grp)

Token.objects.filter(user=sa, identifier=TOK).delete()
t = Token.objects.create(
    user=sa, identifier=TOK, intent=TokenIntents.INTENT_API, expiring=False,
    description="code-mode read-only agent token",
)
print(f"assigned official '{READONLY_ROLE}' role to service account '{SA}' via group '{GRP}'")
print("AUTHENTIK_READ_TOKEN=" + t.key)
