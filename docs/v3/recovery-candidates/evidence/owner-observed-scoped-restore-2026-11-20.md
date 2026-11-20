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

## Additional owner-observed isolated S3 round-trip (20 November 2026)

The owner supplied a Google Cloud Shell screenshot of the local S3 test using
`scripts/ops/solaris-isolated-storage-roundtrip-20261120.sh` at exact commit
`7308ffe420403b4788d4ff6ab62e1d57f2cc2e6b`. The test used a
temporary, Docker-internal S3-compatible SILO service and disposable buckets,
not the hosted Supabase project. Summary lines observed:

```text
PASS: all 108 source payloads match authoritative manifest
Logical Supabase buckets: 3
Isolated S3 buckets: 3
PASS: isolated S3 binary upload/download self-test
PASS: 108/108 objects uploaded to private isolated S3 service
PASS: 108/108 S3 API download hashes and sizes match source manifest
PASS: unauthenticated object GET denied for all isolated test buckets
LOCAL S3 OBJECT-RESTORE ROUNDTRIP SUCCESSFUL
Production never contacted. Test containers and object bytes deleted on script exit.
```

**Scope of success:** 108/108 manifests-to-object-byte mapping, S3 API upload
and readback checksum/size parity, and anonymous GET rejection for all **three
private isolated test buckets**. The service was disposable and the tested
bucket identities were locally mapped; this is **NOT** a Supabase Storage API
round trip or restoration of the original Supabase bucket-policy semantics.
The script's stdout confirms cleanup was reached, but independent Docker
cleanup inspection was not performed.

**Live catalog observation, bounded read-only query, 20 November 2026:** the
hosted Supabase `storage.buckets` catalog currently contains **6 buckets**,
**3** marked public. The catalog contains **10** `storage` RLS policies,
**7** marked `PERMISSIVE` in `pg_policies`. These are **policy mode** counts,
not a claim that those policies permit public access. The 3 logical buckets
in the November 15 archive do not establish coverage of the 6 buckets at this
later observation; inventory exact manifest bucket IDs and compare securely
without publishing their names or object keys.

**Remaining:** actual Supabase-compatible Storage API fixture restore,
original bucket identity/visibility, metadata, JWT/RLS role tests, authorized
private/public readback, Auth/Vault and backup coverage completeness.

## Follow-up live-production metadata-only inventory (20 November 2026)

A bounded read-only connected Supabase catalog query (no object contents, no
secret values, no production mutations) established:

- **6** hosted buckets: **3** with object metadata rows and **3** empty.
- The three populated buckets have **54, 47 and 7** recorded object rows
  (**108 total**). Each of those 108 metadata rows has `created_at` before
  the November 15 Storage archive time, and no rows appear after that time in
  the queried `storage.objects` inventory.
- The November 15 manifest also reports **108 objects across 3 bucket IDs**.
  Count concordance is strong supporting evidence, **not** a proof of
  per-object key or bucket-ID identity parity. The exact manifest bucket IDs
  and keys are intentionally not published in this report.
- `auth.users`, `auth.sessions`, `vault.secrets`, and
  `supabase_migrations.schema_migrations` relations exist in production.
- **6/6** inspected core database roles exist.
- **10/10** inspected regular `storage` tables have RLS enabled and
  **10** Storage policy definitions are present. Four policies name `anon`,
  eight name `authenticated` (some policies include multiple roles).
  **Presence is NOT authorization correctness, nor proof those policies have
  been recovered in an isolated environment.**
- Hosted migration ledger remains **497** records, tip
  `20261101181812`; V3 migration differences remain unresolved and have
  **not** been installed.

These observations advance the **source-inventory baseline only**. They do not
certify backup coverage of Auth/Vault configuration and secrets, original
grants/ownership, RLS positive/negative access tests, a Supabase-specific
Storage API restoration, or a source-to-host migration rehearsal.

## Owner-observed Nov 15 manifest bucket identity match (20 November 2026)

Screenshot of the read-only Cloud Shell command
`scripts/ops/solaris-storage-bucket-identity-compare-20261120.sh`
at commit `2be460804e9fa45cbb286655c4cff1b42db68a0e`:

```text
Nov 15 archived objects: 108
Nov 15 archived populated buckets: 3
bucket hash prefix: 3cd69f7a19514465 object count: 47
bucket hash prefix: 8a47ec53ee41941d object count: 7
bucket hash prefix: 9874ed086020c7de object count: 54
READ-ONLY BUCKET IDENTITY SUMMARY COMPLETE
```

These exactly match the three populated Supabase buckets in the
same-day hosted metadata query. All other hosted bucket object counts are
zero. **Bucket ID and per-bucket object-count parity therefore pass.**
The source-to-host object **key set** has now passed a complete SHA-256 fingerprint comparison for all 108 objects (see follow-up evidence below).

Additional bounded hosted metadata checks confirmed presence of the
`auth.users`, `auth.sessions`, `vault.secrets`, and migration ledger
relations, 6 inspected core roles, and 10 RLS-enabled Storage base tables,
but **not** a recoverability or enforcement certification.

## Exact archived object-key identity comparison (20 November 2026)

The owner supplied a screenshot from Cloud Shell executing the read-only
`scripts/ops/solaris-storage-object-key-set-compare-20261120.sh`
at commit `e2f8b068b3767907f6b6617330008370d5088498`.
All three November 15 archive bucket fingerprints and sorted object-key set
digests **MATCH** the hashed 20 November hosted `storage.objects` snapshot:

```text
Bucket 3cd69f7a19514465: 47 objects; exact object-key set MATCH
Bucket 8a47ec53ee41941d: 7 objects; exact object-key set MATCH
Bucket 9874ed086020c7de: 54 objects; exact object-key set MATCH
PASS: ALL 108 OBJECT BUCKETS AND KEYS MATCH THE HOSTED METADATA SNAPSHOT
```

**Certified scope of this comparison:** all 108 archived manifest records have
the same bucket identities, object counts and key sets as the dated hosted
metadata inventory, with no bucket names or object keys disclosed. Media byte
integrity and independent S3 object-readback were proven by separate tests.
This does **not** prove hosted object-byte equality, Auth/Vault recovery,
original Supabase bucket access rules or full provider-level Storage restore.

## Current hosted role/ACL and RLS baseline (read-only inspection, 20 November 2026)

A bounded **catalog-only** query (no private rows, media, credentials or
secrets) identified **225** application table identities spanning
`public`, `private`, `televoting`, `auth`, and `storage`, including
**202** RLS-enabled tables. Another one-table `vault` provider-managed
schema is outside this scoped application count.

| Schema | Table identities | RLS enabled | Tables with explicit relacl | anon SELECT effective | anon INSERT effective | authenticated SELECT effective | authenticated INSERT effective |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| auth | 27 | 16 | 27 | 0 | 0 | 0 | 0 |
| private | 13 | 1 | 12 | 0 | 0 | 0 | 0 |
| public | 149 | 149 | 149 | 62 | 64 | 90 | 66 |
| storage | 10 | 10 | 9 | 7 | 3 | 7 | 3 |
| televoting | 26 | 26 | 26 | 10 | 0 | 18 | 18 |
| vault (provider-managed) | 1 | 0 | 1 | 0 | 0 | 0 | 0 |

These numbers are **effective table privileges**, not proofs of row visibility
under RLS or findings of vulnerability. Some existing DML grants on launch
critical objects are explicitly known source cutover work; do not change
them directly without the canonical guarded migration authority sequence.

The scoped DB backup was restored with `--no-owner --no-acl` and created
placeholder roles, so **ownership and grant parity remain unproven**, despite
the matching table and RLS counts. The 15-Nov dump includes only five scoped
schemas; do **not** assume it backs up role globals, Vault crypto roots,
provider settings or `supabase_migrations` history. These need separate
protected recovery artifacts/attestation and positive/negative authorization
rehearsals before production cutover.

## What this does NOT prove

- Individual row/data integrity and official contest vote/result parity were not checked in this run.
- The backup is a scoped November 15 archive, not a complete or current recovery point.
- Dummy placeholder roles were used and the script restored with `--no-owner --no-acl`: original privileges, grants, role membership and effective RLS behavior were **not** restored or certified.
- The Storage archive was fully streamed and all 108 object payload SHA-256/size pairs matched the manifest. Only 55/108 archive member names matched manifest bucket/path heuristics; the **S3-compatible** isolated Storage-service round-trip **PASSED**; Supabase Storage API restore and access-policy validation remain **OPEN**.
- Auth/Vault keys, migration-history ledger, provider-managed schema dependencies, external integrations and edge secrets remain **OPEN**.
- The isolated container was disposable and was not retained as a production-derived migration rehearsal fixture.
- This evidence authorizes **NO** blanket source migration replay, mutation of production Supabase, approval of S13–S16, activation of public writes, or Cloudflare promotion.

## Next gates (in order)

1. Verify dated 3-bucket archive coverage against the current 6-bucket hosted inventory; perform an **isolated Supabase Storage API** restore/probe for object metadata, bucket visibility, authenticated and unauthenticated authorization. The separate S3-compatible 108-object round-trip is already completed.
2. Attest original roles/column grants, Auth/Vault/migration-history recoverability and operational configuration.
3. Obtain a sufficiently current recovery point and exact current production-catalog fingerprint.
4. Apply the exact reviewed forward-only S13/S14/Confirmation/Televote/Jury/Results/S16 manifest in a separate isolated production-derived environment and run positive/negative authority, historical vote and results parity checks.
5. Only after recovery and rehearsal certification, obtain explicit operator approval for the exact production SQL bytes and deployment sequence.

Do not place private archives, decryption material, full restore logs, rows or object names in this repository.
