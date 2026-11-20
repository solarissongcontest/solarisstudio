# 2026-11-20: Owner-observed scoped backup restore (verification evidence, not release certificate)

Status: **SCOPED DATABASE RESTORE SUCCESSFUL / FULL PLATFORM RECOVERY OPEN / PRODUCTION STOP**.

## Evidence boundary

The owner supplied a screenshot of a Google Cloud Shell run of the isolated, local-only recovery script from commit `f717864cb0f981714d69ff1888a3b211a1bf8b54`, file `scripts/ops/solaris-clean-cluster-restore-20261120.sh`. The screenshot shows the terminal output below. This note records that output only; it does **not** claim independent custody of private backup bytes or external verification of original hosted rows.

```text
[1/4] Checking backup archive readability and Storage member bytes
PASS: Storage TAR entries 109
[2/4] Initializing clean isolated PostgreSQL cluster, without Supabase init SQL
[3/4] Preparing only schema containers and policy role identities
[4/4] Restoring application dump into clean isolated database
ISOLATED SCOPED DATABASE RESTORE SUCCESSFUL
Restored tables=225; RLS tables=202
Televote table present=true
RESTORE TEST ONLY: owner/ACL, Auth/Vault roots, complete Storage-service restore and V3 migration rehearsal are not certified.
Production was never contacted; disposable container will now be deleted.
```

## What passed

- The owner-observed encrypted backup fingerprint/decryption/archive checks succeeded under the script's explicit checks.
- The isolated restore completed its transactional `pg_restore` without reporting an error.
- Restored table count and RLS-table count matched the historical November 15 owner-reported values (225 / 202).
- `televoting.televote_aggregations` exists in the restored database.
- The script configuration isolated Docker networking and did not include a connection to hosted production.

## What this does NOT prove

- Individual row/data integrity and official contest vote/result parity were not checked in this run.
- The backup is a scoped November 15 archive, not a complete or current recovery point.
- Dummy placeholder roles were used and the script restored with `--no-owner --no-acl`: original privileges, grants, role membership and effective RLS behavior were **not** restored or certified.
- The Storage archive was fully streamed and 109 TAR entries were listed; per-object digest/manifest parity and an isolated Storage-service round-trip remain **OPEN**.
- Auth/Vault keys, migration-history ledger, provider-managed schema dependencies, external integrations and edge secrets remain **OPEN**.
- The isolated container was disposable and was not retained as a production-derived migration rehearsal fixture.
- This evidence authorizes **NO** blanket source migration replay, mutation of production Supabase, approval of S13–S16, activation of public writes, or Cloudflare promotion.

## Next gates (in order)

1. Validate Storage manifest and object digests, then perform real isolated Storage-service restoration and access-policy probes.
2. Attest original roles/column grants, Auth/Vault/migration-history recoverability and operational configuration.
3. Obtain a sufficiently current recovery point and exact current production-catalog fingerprint.
4. Apply the exact reviewed forward-only S13/S14/Confirmation/Televote/Jury/Results/S16 manifest in a separate isolated production-derived environment and run positive/negative authority, historical vote and results parity checks.
5. Only after recovery and rehearsal certification, obtain explicit operator approval for the exact production SQL bytes and deployment sequence.

Do not place private archives, decryption material, full restore logs, rows or object names in this repository.
