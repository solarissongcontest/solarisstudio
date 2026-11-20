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

## Additional owner-observed Storage SHA-256 verification (20 November 2026)

The owner later supplied a Google Cloud Shell screenshot of the read-only verifier
`scripts/ops/solaris-storage-manifest-verify-20261120.sh` at commit
`1f017a9cac129a618506e5d614e47bb57295e564`.

```text
Storage TAR regular files: 109
Object members (excluding manifest): 108
Unsafe entries: 0
Manifest files: 1
Manifest object records: 108
Manifest SHA-256/size fields valid: 108
Unmatched expected content digests: 0
Unreferenced archive content digests: 0
PASS: all 108 manifest hashes and sizes match archived bytes
Bucket+path mapping confirmed: 55 / 108
Path-only mapping (bucket not proved): 0
NOTE: some bucket/path mappings cannot be certified from archive naming
Storage-service restoration: NOT YET TESTED
```

Interpretation: all **108 object payloads** match the manifest SHA-256/size
**multiset**, proving complete archived content coverage against the owner's
manifest. The literal archive-member name resolves to the manifest bucket/path
for **55/108**, leaving **53** bucket/path name mappings unproven by this
heuristic. Those 53 are **not missing bytes**; an isolated restoration can map
each manifest record to payload by its verified digest/size if the manifest
itself is the approved path authority. Repeated identical digests can still
resolve byte contents deterministically (they are byte-identical), but bucket
authorization and metadata fidelity remain a separate requirement.

**Next Storage gate:** provider-compatible isolated Storage-service restoration
using the manifest's bucket/path as the intended destination and digest/size
for payload selection; validate target object bytes, metadata, bucket policies
and private authorization. No such provider-level round-trip is claimed.

## What this does NOT prove

- Individual row/data integrity and official contest vote/result parity were not checked in this run.
- The backup is a scoped November 15 archive, not a complete or current recovery point.
- Dummy placeholder roles were used and the script restored with `--no-owner --no-acl`: original privileges, grants, role membership and effective RLS behavior were **not** restored or certified.
- The Storage archive was fully streamed and all 108 object payload SHA-256/size pairs matched the manifest. Only 55/108 archive member names matched manifest bucket/path heuristics; the isolated Storage-service round-trip and access-policy validation remain **OPEN**.
- Auth/Vault keys, migration-history ledger, provider-managed schema dependencies, external integrations and edge secrets remain **OPEN**.
- The isolated container was disposable and was not retained as a production-derived migration rehearsal fixture.
- This evidence authorizes **NO** blanket source migration replay, mutation of production Supabase, approval of S13–S16, activation of public writes, or Cloudflare promotion.

## Next gates (in order)

1. Use verified Storage manifest content hashes to map all 108 source payloads to intended bucket/path keys, then perform real isolated Storage-service restoration with object-byte, metadata and access-policy probes.
2. Attest original roles/column grants, Auth/Vault/migration-history recoverability and operational configuration.
3. Obtain a sufficiently current recovery point and exact current production-catalog fingerprint.
4. Apply the exact reviewed forward-only S13/S14/Confirmation/Televote/Jury/Results/S16 manifest in a separate isolated production-derived environment and run positive/negative authority, historical vote and results parity checks.
5. Only after recovery and rehearsal certification, obtain explicit operator approval for the exact production SQL bytes and deployment sequence.

Do not place private archives, decryption material, full restore logs, rows or object names in this repository.
