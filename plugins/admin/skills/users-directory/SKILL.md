---
name: users-directory
description: >
    Add or invite people, organize them into groups, and hand out API access. Use
    when someone wants to create, invite, deactivate, or inspect a user, add users to
    a group, reset another user's password, or create a service account and token for
    a script or integration. Covers the user, group, and invitation records
    themselves; what a role is *allowed* to do lives in policies-rbac, recovering a
    locked-out admin lives in operations, and the signup flow design in flows-stages.
---

# authentik users and directory

## Purpose

This skill manages the people in authentik: user accounts, the groups that organize
them, the roles assigned to them, and the invitations that let new users enroll. It
covers the lifecycle and data of those records (creating, editing, deactivating, and
inspecting them) as the foundation that policies and flows act on.

## When to invoke

- "Create / deactivate a user account."
- "Add these users to a group" or "what groups is this user in?"
- "Reset a specific user's password" (an admin acting on another account).
- "Send an enrollment invitation."
- "Create a service account / API token for a script."

Not this skill: what a role is _allowed_ to do (policies-rbac), recovering the
superuser/admin account when locked out (operations), or the self-service enrollment
flow design (flows-stages).

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
in the live docs. Every `[authentik]` step gives both paths — the hands-off code-mode
propose, and the click-by-click admin UI.

### Invite a user (single or in bulk)

**Result:** the person gets a link that signs them up through your enrollment flow.

1. **[authentik]** Create the invitation:
    - _Hands-off:_ code-mode proposes an invitation Blueprint; apply it.
    - _In the UI:_ **Directory → Invitations → New Invitation**; pick the enrollment
      flow, set **Expires**, optionally add **Custom attributes** to pre-fill fields,
      and toggle **Single use**.
2. **[authentik]** Share the link, or use **Send via Email** (one recipient per line
   for a bulk send).
3. **[docs]** `<docs>` users-sources/user/invitations.

**Gotchas:** an invitation needs an **enrollment flow** to point at; **custom-attribute
keys must match the flow's prompt-stage field keys** or nothing pre-fills; a
**single-use** invite auto-deletes after the first enrollment.
**Verify:** open the invite link in a private window and confirm it enrols.

### Create a group and assign membership

**Result:** a group whose members inherit its roles and app bindings.

1. **[authentik]** Create the group and add members:
    - _Hands-off:_ code-mode proposes the group Blueprint; apply it.
    - _In the UI:_ **Directory → Groups → Create** (Name, optional **Parent groups**,
      **Roles**); add people from the group's **Users** tab or a user's **Groups** tab.
2. **[docs]** `<docs>` users-sources/groups.

**Gotchas:** **`is_superuser` cascades to every child group**, so never set it on a broad
parent; roles **inherit from parent groups** (check the **All Roles** tab); since
2025.2, toggling superuser needs its own permission.
**Verify:** a member picks up the group's app bindings and roles.

### Create a service account for API access

**Result:** a non-interactive identity with a token a script or integration can use.

1. **[authentik]** Create it:
    - _In the UI:_ **Directory → Users → New User → Service Account** (Username,
      optional **Create Group**, expiry); then **Directory → Tokens and App passwords →
      Create** to mint an **API Token**.
    - _Hands-off:_ code-mode can read existing accounts/tokens to confirm scope.
2. **[docs]** `<docs>` sys-mgmt/service-accounts.

**Gotchas:** the generated **password/token is shown once** at creation, so capture it; a
service account **can't use the browser UI** (non-interactive only); prefer expiring
tokens (authentik auto-rotates them) and scope the account's permissions.
**Verify:** the token authenticates an API call.
