---
name: operations
description: >
    Keep the authentik instance itself running: check the version and upgrade safely,
    get back in when the admin account is locked out, add or rotate a certificate,
    brand the login page, and back up and restore. Covers instance lifecycle,
    recovery, certificates, Brands, global settings, and blueprints. Use for
    operational, instance-level questions ("which version am I on", "reset my admin
    password", "rotate this cert") rather than configuring authentication features.
    Resetting an ordinary user's password lives in users-directory; diagnosing a
    runtime failure in troubleshooting.
---

# authentik operations

## Purpose

This skill handles authentik as a running system rather than its authentication
features: what version it is, how to upgrade it, how to get back in when the admin
account is locked out, and how to manage instance-wide settings, certificates, brands,
and blueprints. These are the lifecycle and recovery tasks an operator reaches for.

## When to invoke

- "Which version of authentik am I running?" / "Is there an update?"
- "Reset my admin password" or "I'm locked out of the superuser account."
- "Rotate or import a certificate." (crypto)
- "Change instance-wide branding / settings." (Brands, settings)
- "Manage configuration as code." (blueprints)

Not this skill: resetting another ordinary user's password (users-directory), or
diagnosing a runtime failure (troubleshooting).

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

Steps are tagged by **where it happens**: `[authentik]` in the instance, `[host]` on
the server/cluster (these need shell access, not the UI), `[docs]` in the live docs.

### Upgrade authentik safely

**Result:** the instance moves to a newer release without data loss.

1. **[host]** Back up the database first, and read the release notes for breaking changes.
2. **[host]** Pull and restart:
    - _Docker Compose:_ fetch the new `compose.yml`, then `docker compose pull && docker compose up -d`.
    - _Kubernetes/Helm:_ `helm repo update && helm upgrade ... -f values.yaml`.
3. **[authentik]** Confirm the new version at **Dashboards → Overview** (migrations run
   automatically on start).
4. **[docs]** `<docs>` install-config/upgrade and the release notes.

**Gotchas:** there is **no downgrade**, so if a migration fails, restore the backup; don't
skip major versions (go 2025.2 → 2025.4 → 2025.6); server, worker, and all outposts must
run the **same version**.
**Verify:** Overview shows the new version and login still works.

### Get back into a locked-out admin account

**Result:** a time-limited link that logs you in as the admin.

1. **[host]** Mint a recovery link (needs server/CLI access):
    - _Docker:_ `docker compose run --rm server create_recovery_key 10 akadmin`
    - _Kubernetes:_ `kubectl exec -it deployment/authentik-worker -c worker -- ak create_recovery_key 10 akadmin`
    - The arguments are minutes and username.
2. **[docs]** `<docs>` troubleshooting/login.

**Gotchas:** the link is **sensitive**: anyone holding it gets admin; it expires (10
minutes above); substitute the real username for `akadmin`.
**Verify:** the link logs you in as admin.

### Add or rotate a certificate

**Result:** authentik serves and signs with the right keypair.

1. **[authentik]** Import and assign:
    - _In the UI:_ **System → Certificates** to import a keypair; assign it on the provider
      (SAML signing) or **System → Brands → Web Certificate**.
    - _[host] alternative:_ `ak import_certificate --certificate cert.pem --private-key key.pem --name mycert`,
      or mount `/certs` for auto-discovery (`fullchain.pem` / `privkey.pem`).
2. **[docs]** `<docs>` sys-mgmt/certificates.

**Gotchas:** re-importing the same key **updates** the cert (no duplicate); the default
self-signed cert **expires after 1 year**, so set a rotation reminder for SAML apps (Slack
checks expiry); reverse proxies and CDNs may cache the old cert.
**Verify:** the provider or brand serves the new cert.

### Brand the login page

**Result:** the login and flow pages show your logo, title, and theme.

1. **[authentik]** Edit the brand: **System → Brands → Edit**; set **Branding title**,
   **Logo**, **Favicon**, **Default flow background**, the **Default flows**, and (2025.4+)
   **Custom CSS**; set **Domain matching** or mark it the default brand.
2. **[docs]** `<docs>` sys-mgmt/brands and custom-css.

**Gotchas:** if no brand matches the domain, authentik falls back to the **default brand**,
so make sure one is the default; **Custom CSS** should use CSS variables and `::part()`
selectors (direct element selectors break on upgrades) and is CDN-cached (test in
incognito).
**Verify:** the branded login page renders for the domain.

### Back up and restore

**Result:** you can rebuild the instance from a backup.

1. **[host]** Back up the critical pieces: the **PostgreSQL database** and the
   **`AUTHENTIK_SECRET_KEY`** (store it separately); optionally `/data`,
   `/custom-templates`, `/certs`, `/blueprints`.
2. **[host]** To restore: restore PostgreSQL first, verify it, restore the optional dirs,
   then start authentik.
3. **[docs]** `<docs>` sys-mgmt/ops/backup-restore.

**Gotchas:** the **secret key is as critical as the database**; without the original,
encrypted data is unrecoverable; store backups offsite; `/data` only matters if you're
not on S3.
**Verify:** a restore on a scratch instance comes up and lets you log in.
