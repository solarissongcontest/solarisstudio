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

## Hosted permissions fingerprint baseline (20 November 2026, read-only)

Using bounded SELECTs over PostgreSQL catalogs (no private rows, secrets,
media, user identities or SQL bodies), the connected Supabase project reported:

| Schema | Tables | RLS-enabled | Explicit table ACLs | RLS policies | Explicit column ACLs | Table owner/ACL digest SHA-256 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| auth | 27 | 16 | 27 | 0 | 0 | `8f329f2a8c9d5912237cae44373b17b5e9d37c195a852ef8420f28fbad18536f` |
| private | 13 | 1 | 12 | 0 | 0 | `9d7d119f0d4a6caa086f0d8a83c173388f7858aa21611188105745ef4cb92087` |
| public | 149 | 149 | 149 | 197 | 2 | `868f63c6f61ad87edc56ea03f1d362906c9d9c0e78c71af3efbc3e93be83e981` |
| storage | 10 | 10 | 9 | 10 | 0 | `d0703297d0e3fb86340d92dfee386c98b9a48815ea93117e5c2d67a3e505ee8e` |
| televoting | 26 | 26 | 26 | 58 | 0 | `ad19940a504a5cc06fe7ec7ebf9f45c38c3e61c0ed44c310851bd734b648bad0` |

* Fingerprints hash sorted relation identities, owner names, explicit table ACL
  arrays and RLS flags. They are **baseline evidence only**. A full parity
  proof requires a matching comparison algorithm and original roles, **not**
  simply a familiar number of RLS-enabled tables.
* Policy digests and explicit column-ACL digests were also captured in the
  bounded tool observation but are not a replacement for effective user/role
  authorization tests. The policy count is **265** across the five scoped
  schemas.
* The successful earlier isolated restore used `--no-owner --no-acl`,
  therefore **actual restored ownership/ACL fidelity remains UNPROVEN**.
* No claim is made that the scoped database dump includes migration history,
  provider-managed Vault encryption roots, Auth provider secrets, or global role
  memberships. Those remain recovery blockers.

The encrypted archive's TOC inventory is now owner-observed as completed: **1,058 ACL** and **27 DEFAULT ACL** entries exist. A role-faithful isolated restore and effective permission checks are still required.

## Owner-observed encrypted database role/ACL TOC audit (20 November 2026)

The owner supplied a screenshot of the successful read-only Cloud Shell run of
`scripts/ops/solaris-encrypted-dump-role-acl-toc-preflight-20261120.sh`
at commit `989d3c291b1722a10c1d42dae43fbb505126ded5`.
The screenshot reports:

```text
Custom archive version: PostgreSQL 17.11
Application TABLE definitions: 225
Application TABLE DATA entries: 225
ACL entries: 1058
DEFAULT ACL entries: 27
POLICY entries: 265
TRIGGER entries: 301
Unique TABLE owner names in TOC: 5
Vault TABLE definitions in scoped dump: 0
Migration-ledger TABLE definitions in scoped dump: 1
auth: 27 table definitions; 27 table-data entries
private: 13 table definitions; 13 table-data entries
public: 149 table definitions; 149 table-data entries
storage: 10 table definitions; 10 table-data entries
televoting: 26 table definitions; 26 table-data entries
READ-ONLY TOC AUDIT COMPLETE; ownership/role recovery NOT CERTIFIED.
```

**Meaning:** The archive does contain ACL/default ACL and RLS policy TOC
entries, unlike a stripped schema-only export; therefore original database
grant/ownership metadata is plausibly available for an isolated
role-faithful recovery. This is **inventory only**, not proof that original
grants can be successfully applied or that effective permissions will match
hosted production.

The observed `supabase_migrations` table *definition* does **not** prove
that all 497 migration records or their checksums were captured. The
absence of `vault` table definitions in the scoped archive does not prove
that Vault was empty: provider-managed encryption root recovery is
**unverified and remains blocked**.

A bounded, read-only 20-Nov hosted catalog inspection independently reports
**three distinct current table-owner roles** across the same five
application schemas, of which one can bypass RLS, with **11** role-membership
edges related to those current owners and **32** roles in the hosted
database. The archived TOC reported **five distinct owner labels**, so
owner identity mapping/date drift and parser scope need explicit
reconciliation; **do not declare owner parity from counts**.

**Next safe work, without requesting another backup script run:** inspect
the existing source-side role/permission recovery tooling; design a
networkless test that restores grant metadata using compatible roles,
checks exact owner/ACL/policy fingerprints, and performs positive/negative
anonymous/authenticated/service-role access probes. Before any such test,
reconcile the five archived owner labels versus three current owner roles.
No passwords, memberships or Auth/Vault encryption keys are assumed to
be stored in this archive.

## 19:55 local owner-observed role/ACL rehearsal preflight (still blocked)

The owner-supplied terminal screenshot of the role/ACL replay script at
`02767d93bf801fc0f252db65f50f110d576d7e4b` stopped **before
restoration**, during private archive owner inventory, with:

```text
[3/4] Preparing restricted archive-owner/ACL role identities
STOP: unexpected TABLE inventory: application=225, ledger=1, total=236
```

The earlier successful TOC audit correctly counted only the five application
schemas (225 tables) while separately reporting one migration-ledger TABLE;
this later output proves **10 other TABLE TOC definitions** in the archive
outside that application+ledger scope. The older rehearsal script wrongly
required 226 total, not the observed 236. No production access or schema write
was involved.

Corrected script and synthetic tests require exactly **225 application,
1 migration ledger, 10 other, 236 total** and do not treat other object names
as role identities. The static CI safety workflow passed at
`cea115fd9bd1463f6ae0599af3d90ce3a2b9c9ab`.
**Actual owner/ACL replay remains UNEXECUTED/UNCERTIFIED** until the owner
runs that corrected revision against the private encrypted backup. The other
ten TABLE owners must be resolved safely during the same networkless restore;
their precise schema identities are not claimed in public evidence.


## Owner-observed isolated owner/ACL restoration success (20 November 2026, 20:00 Finland)

The operator supplied a Cloud Shell screenshot of the **network-isolated,
transactional owner/ACL-preserving restore** using
`scripts/ops/solaris-role-acl-rehearsal-20261120.sh` at commit
`cea115fd9bd1463f6ae0599af3d90ce3a2b9c9ab`. The run completed
successfully and deleted its disposable PostgreSQL container. It used the
operator-held private November 15 encrypted archive, **not production**.

```text
[3/4] TABLE owner inventory verified: application=225, ledger=1, other=10, total=236
Restricted local role placeholders prepared; membership recovery remains OPEN
[4/4] Applying original archive ownership and ACL entries in isolated PostgreSQL
ISOLATED ARCHIVE OWNER/ACL RESTORE APPLIED
Restored tables=225; RLS tables=202; tables with explicit ACL=209; table-owner role identities=3
RLS policies present: 265 / 265
DEFAULT ACL entries present: 27 / 27
Hosted Nov20 vs Nov15 replay auth owner/ACL/RLS: DIFFERENT
Hosted Nov20 vs Nov15 replay private owner/ACL/RLS: DIFFERENT
Hosted Nov20 vs Nov15 replay public owner/ACL/RLS: DIFFERENT
Hosted Nov20 vs Nov15 replay storage owner/ACL/RLS: MATCH
Hosted Nov20 vs Nov15 replay televoting owner/ACL/RLS: DIFFERENT
Dated hosted-owner/ACL digest matches: 1 / 5
PASS: anon role: RLS active, Auth tables not readable, edition read granted
PASS: authenticated role: RLS active, Auth tables not readable, edition read granted
PASS: anon can execute read-only, RLS-governed public edition query
PASS: authenticated can execute read-only, RLS-governed public edition query
PASS: anon direct auth.users SELECT is denied by PostgreSQL
PASS: authenticated direct auth.users SELECT is denied by PostgreSQL
ISOLATED OWNER/ACL REPLAY AND SCOPED AUTHORIZATION PROBES SUCCESSFUL
Production was never contacted; disposable container will now be deleted.
```

**Completed:** a scoped permission-preserving archival database restore, including
225 application TABLE objects, 265 RLS policies, 27 default ACL objects, and
successful positive and negative read-only role probes. The 209 explicit
table ACL count is from the restored `relacl` catalog, not the number of
`pg_restore` ACL TOC entries (1,058). Those are different measures.

**Unresolved:** only Storage's owner/ACL/RLS fingerprint matched current
hosted production. The other four differences **cannot be attributed to
Nov15–Nov20 changes without further evidence**; restore role configuration,
catalog comparisons, or drift could be involved. The role fixture does not
restore all global role flags, memberships or provider secrets. The probe
matrix was scoped, not a full app-user/delegation/organizer authorization test.
Auth/Vault encryption-root configuration, Supabase-specific Storage API
recovery, newer restore point and ordered S13–S16 migration rehearsal remain
**NO-GO**. Do not infer permission completeness or approve production
migrations solely from this result.

## What this does NOT prove

- Individual row/data integrity and official contest vote/result parity were not checked in this run.
- The backup is a scoped November 15 archive, not a complete or current recovery point.
- **Initial** scoped database restoration used `--no-owner --no-acl`; it did not test original permissions. A **later** isolated owner/ACL-preserving restoration and scoped role authorization probes succeeded (above), but original global role flags, membership parity and full effective RLS behavior are still **not** certified.
- The Storage archive was fully streamed and all 108 object payload SHA-256/size pairs matched the manifest. Only 55/108 archive member names matched manifest bucket/path heuristics; the **S3-compatible** isolated Storage-service round-trip **PASSED**; Supabase Storage API restore and access-policy validation remain **OPEN**.
- Auth/Vault keys, migration-history ledger, provider-managed schema dependencies, external integrations and edge secrets remain **OPEN**.
- The isolated container was disposable and was not retained as a production-derived migration rehearsal fixture.
- This evidence authorizes **NO** blanket source migration replay, mutation of production Supabase, approval of S13–S16, activation of public writes, or Cloudflare promotion.

## Next gates (in order)

1. The Nov15 three populated bucket identities and all 108 object-key sets matched the dated hosted inventory; now perform an **isolated Supabase Storage API** restore/probe for metadata, bucket visibility and positive/negative authenticated/unauthenticated authorization. The separate S3-compatible 108-object round-trip is already completed.
2. Reconcile the four current-hosted versus Nov15 owner/ACL/RLS digest differences, then attest global roles/memberships/column grants and Auth/Vault/migration-history recoverability and operational configuration.
3. Obtain a sufficiently current recovery point and exact current production-catalog fingerprint.
4. Apply the exact reviewed forward-only S13/S14/Confirmation/Televote/Jury/Results/S16 manifest in a separate isolated production-derived environment and run positive/negative authority, historical vote and results parity checks.
5. Only after recovery and rehearsal certification, obtain explicit operator approval for the exact production SQL bytes and deployment sequence.

Do not place private archives, decryption material, full restore logs, rows or object names in this repository.
