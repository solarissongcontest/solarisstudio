# Private recovery qualification: permissions, Auth, Vault and Storage

**Status: BLOCKED for production migration.** This extends #2606; it does not
replace the System recovery stages or authorize hosted writes. Reuse #2605's
bounded effect/history evidence. A missing ledger version is not missing SQL.

## Completed evidence and the remaining diagnostic

The owner completed the Nov15 owner/ACL-preserving PG17.11 restore: 225 application
tables, 202 RLS tables, 265 policies, 27 total default ACL records. All 108 Storage
objects passed payload hashes and an isolated S3 round-trip/key-set comparison.
Do not repeat those byte checks to repair an unrelated permission diagnostic.

On Nov20 a separately authorized catalog-only observation confirmed the canonical
project `dkxmnvekiopyesuzggeu`, PG17.11, and **the same five current-hosted raw
owner/ACL/RLS digests** used in the owner's comparison. Thus there is no evidence
that changes to that hosted baseline explain the four restore mismatches.
The prior restored container was deleted without an object-level snapshot. Its
four mismatches cannot be attributed to ACL order, real permission changes,
ownership or role recovery from the surviving aggregate hashes alone.

`scripts/ops/solaris-permission-snapshot.sql` now captures a single JSON result
inside an explicit read-only transaction (10s statement / 2s lock limit). Scope:
Auth, Private, Public, Storage, Televoting; relation/column/schema/default ACLs,
owners, RLS flags, policy-expression hashes, global role flags/membership options,
and current-database/global role configuration. No rows, password hashes, raw
policy/function bodies, Vault data or secret-valued settings are queried.
Other database settings and schemas are outside this snapshot's certification.
Default ACL **scope** is recorded separately from the archive's all-schema count;
12 in this bounded current-hosted scope must not be compared with 27 globally.

The Python comparator uses role names instead of cluster-local OIDs and normalizes
ACL order and implicit default ACLs. It retains raw ACL representation differences,
reports real owner/grant/grant-option/column/RLS/policy/default-ACL/membership/
role-config differences, and never generates corrective SQL. Missing sections,
flags, duplicate identities and uncaptured settings fail closed. A scoped match
is **not** S16, application authorization or platform recovery certification.
Reports are new 0600 files; private evidence is never overwritten or printed.

## One consolidated private operator pass

Use the exact reviewed checkout and a protected workstation with the existing
private archives/key. Do not upload backups, keys, private reports or local tokens
to ChatGPT, CI or GitHub. The implementing environment has no access to those files.

1. Save the approved current catalog-only JSON as a private file. The SQL above
   is a single-result SQL Editor export if no secure metadata transfer exists.
   Keep the production project binding, query SHA-256 and timestamp with it.
   This is metadata collection, never a test or migration against production.
2. Run the local contract tests **before** touching private backup material:

   ```sh
   node --test scripts/ops/solaris-role-acl-rehearsal.contract.test.mjs
   PYTHONDONTWRITEBYTECODE=1 python3 scripts/ops/solaris-permission-compare.test.py
   PYTHONDONTWRITEBYTECODE=1 python3 scripts/ops/solaris-local-platform-probes.test.py
   ```

3. With the already established private `$HOME/solaris-recovery` layout, run once:

   ```sh
   SOLARIS_EXPECTED_PERMISSIONS="$HOME/solaris-recovery/permissions-current.private.json" \
     bash scripts/ops/solaris-role-acl-rehearsal-20261120.sh
   ```

   It preserves the original owner/ACL entries, snapshots the restored metadata
   **before** deleting its own networkless container, and completes the existing
   real role/RLS denial probes even if the comparison differs. Exit **2** means
   comparison differences/incomplete evidence, **1** means execution failure;
   zero only means the **scoped** comparison and existing probes passed.
   Inspect `permission-differences.private.json` locally by section/object/field.
   Do not publish raw restore logs. Keep the two input SHA-256 values in the report.
   No observed production permission is automatically copied into a fixture.
4. Resolve each real difference in the isolated environment against its source
   and observed role contract. Never strip grants, owner records or policies to
   force a matching hash. Placeholder roles do not recover LOGIN/passwords,
   inheritance, BYPASSRLS, memberships or role settings. Any proposed role change
   needs a reviewed profile and execution under the intended non-superuser role.
   Do not claim a superuser-only restore proves ordinary operator authority.
5. On a **separately egress-isolated Supabase fixture**, prepare two synthetic
   canary identities and one nonpublic object using the real approved application
   path/policies. The policy must permit the owner and deny the second identity.
   Prepare an expired local token too. Never reuse production access tokens.
   Store a 0600 JSON configuration outside the checkout:

   ```json
   {
     "base_url": "http://127.0.0.1:54321",
     "synthetic_fixture": true,
     "egress_isolated": true,
     "anon_key": "LOCAL_ONLY",
     "owner_token": "LOCAL_ONLY",
     "other_token": "LOCAL_ONLY",
     "expired_token": "LOCAL_ONLY",
     "owner_id": "SYNTHETIC_USER_UUID",
     "other_id": "DIFFERENT_SYNTHETIC_USER_UUID",
     "bucket": "PRIVATE_CANARY_BUCKET",
     "object_key": "SYNTHETIC_OWNER/canary",
     "sha256": "64_LOWERCASE_HEX_DIGITS_OF_CANARY_BYTES"
   }
   ```

   ```sh
   SOLARIS_RUN_LOCAL_API_RECOVERY=YES \
     python3 scripts/ops/solaris-local-platform-probes.py \
     --config "$HOME/solaris-recovery/platform-canaries.private.json" \
     --report "$HOME/solaris-recovery/platform-canaries-result.private.json"
   ```

   This sends only bounded GET requests to literal loopback, ignores proxies,
   rejects redirects, verifies both Auth identities, rejects absent/expired Auth
   credentials and unauthorized admin access, verifies exact permitted object
   bytes and rejects wrong-user/anonymous/expired/public-path access. The
   egress-isolation attestation must be independently checked on the service
   network; a loopback proxy to production is forbidden. HTTP contract tests use
   a fake server and **do not certify real Supabase API recovery**.

## Auth and Vault: supported recovery boundaries

Use the current [Supabase backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[Vault documentation](https://supabase.com/docs/guides/database/vault) and
[platform-to-self-hosted recovery guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
Provider-internal schema/configuration cannot be reconstructed by inventing SQL.
The documented roles export is separate from schema/data; custom LOGIN role
passwords require secure destination provisioning. Do not export `pg_authid`
or request credentials in chat. Do not apply the guide's history-copy example to
an existing production ledger: preserve actual original records, never fabricate.

* **Auth data:** restored users/identities/sessions and custom triggers/policies
  are one component. Confirm compatible GoTrue schema/version, signing-key/JWT
  policy, encryption material, provider and redirect configuration, SMTP/SMS and
  hooks independently. Keep mail, webhooks, cron and external providers disabled
  or sandboxed during isolated recovery. Test local synthetic login, refresh,
  logout/revocation, session/account isolation and role hooks; the read-only
  canaries above intentionally do not claim these mutation flows passed.
* **Vault encrypted data:** the scoped archive has no Vault definitions; five
  current encrypted records are owner-observed. That is **missing recovery
  coverage**, not proof of lost plaintext or a recoverable ciphertext backup.
  Establish a separately approved encrypted backup of the required extension,
  encrypted rows and metadata without querying `vault.decrypted_secrets`.
* **Encryption-root custody:** Vault's root is outside the database. The official
  documentation describes provider-managed key custody/access; a database dump
  alone does not recover it. Obtain the supported project-specific recovery
  procedure from Supabase and verify an independently accessible secured key or
  provider restoration path. Do not print/read/export a root through these tools.
* **Actual Vault restoration:** use the compatible extension in the protected
  isolated runtime. Prove original ciphertext can be used there with the
  recovered root by a private value-comparison/canary that emits only pass/fail.
  Creating a new secret with a new root is not recovery of the five original
  records. Without ciphertext **and** supported root access, this gate is BLOCKED.
* **Storage service:** the completed S3 byte round-trip is retained. Real
  Supabase Storage metadata, policies, API JWT verification and user-scoped
  access remain independent; use the scoped API probes above, then the required
  canonical upload/finalize/download workflow. Never change restored policies
  merely to make a probe pass.

## Ordered migration gate (existing architecture)

Reuse `.github/scripts/v3-observed-owner-recovery-local.sh` and the existing
S13–S16 workflow/classifier, not an old seven-stage bundle. Current main emits
**29 local stages**, including four explicitly local candidates, thirteen
historical-source stages, two generator sources and ten locally emitted stages.
The existing `scripts/v3-s13-s16-stage-provenance.mjs` deliberately marks **zero**
stages production-executable. Its passing test does not qualify those stages.

Only after role/ACL, Auth/Vault/Storage, consistent recovery-point and dependency
preconditions pass can System qualify exact SQL bytes for a separate clone of
the restored baseline. Run the existing full enabled lifecycle on that **same**
recovered database, preserving untouched baseline/digests/history. Synthetic
fixtures and successful clean-source S14 runs cannot substitute for this gate.

No production-ready manifest is asserted by this PR. The frozen manifest still
needs effect-level preflights, compatible original role/runtime evidence,
transaction/lock budgets, interruption/retry qualification, before/after official
data and publication digests, restoration/forward-repair evidence and explicit
owner approval of its exact SQL hashes/source SHA. Keep maintenance/public writes
unchanged. No production migration, history repair, restoration or deployment
is performed by these tools.
