"""Provision a least-privilege read-only agent identity in authentik.

Run from the authentik checkout:  uv run ak shell < <path>/provision-agent-identity.py
Prints AUTHENTIK_READ_TOKEN=<key>; set that as the code-mode MCP's AUTHENTIK_TOKEN.
"""

from django.contrib.auth.models import Permission

from authentik.core.models import Group, Token, TokenIntents, User, UserTypes
from authentik.rbac.models import Role

ROLE, SA, GRP, TOK = "ak-agent-read", "ak-agent", "ak-agent-grp", "ak-agent-read-tok"

role, _ = Role.objects.update_or_create(name=ROLE)

# Allow-list: every view_* permission EXCEPT secret-reveal (codename ends "_key")
# and token-object views (codename ends "token"). See agent-security-model.md §5/§7.
codes = [
    f"{p.content_type.app_label}.{p.codename}"
    for p in Permission.objects.filter(codename__startswith="view_")
    if not (p.codename.endswith("_key") or p.codename.endswith("token"))
]
role.assign_perms(codes)

sa, _ = User.objects.update_or_create(
    username=SA, defaults=dict(name="authentik agent (read-only)", type=UserTypes.SERVICE_ACCOUNT)
)
grp, _ = Group.objects.update_or_create(name=GRP)
grp.roles.add(role)
sa.ak_groups.add(grp)

Token.objects.filter(user=sa, identifier=TOK).delete()
t = Token.objects.create(
    user=sa, identifier=TOK, intent=TokenIntents.INTENT_API, expiring=False,
    description="code-mode read-only agent token",
)
print(f"granted {len(codes)} view perms (excluded *_key and *token)")
print("AUTHENTIK_READ_TOKEN=" + t.key)
