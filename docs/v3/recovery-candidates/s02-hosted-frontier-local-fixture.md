# S02: isolated hosted-frontier fixture preflight (candidate, not certification)

> **12 November owner-directed scope clarification:** Original S02 concerns the *relevant* S13/S14 dependency closure, not automatic reconstruction of every unrelated hosted routine/table. Historical whole-platform paragraphs below are dated stronger certification limits, not a new blanket acceptance rule. The unmatched reachable strict-dual body still prevents historical hosted-runtime signoff. The separate [S02-BETA-SOURCE contract](./s02-source-defined-beta-contract.md) and executable target-specific gate qualify only a fresh isolated source baseline after their actual checks pass; they cannot approve original hosted S02/S06, a live beta or production recovery.

**Task:** S02 only. **Status:** SCOPED LOCAL RECONSTRUCTION VERIFIED, **FULL HOSTED-HEAD EQUIVALENCE NOT CERTIFIED**. The PG17.11 networkless fixture has been run against the dated hosted-observed S14 catalog and forward-only S13/Archive S14 candidates, but does not represent the entire production schema. This document is **not** permission to deploy, run hosted SQL, change migration history, or lift production maintenance.

## Evidence and inherited constraints

- S01 has been merged to current main via [#2422](https://github.com/solarissongcontest/solarisstudio/pull/2422). Its [dated 9 November inventory](./evidence/s01-hosted-source-delta-2026-11-09.md) records source history and bounded hosted catalog observations: hosted head `20261101181812`, cutover `20261014020000`, **36** post-cutover history holes and **33** later source files. An absent migration-history record does not prove the complete SQL effect absent.
- Existing draft [#2390](https://github.com/solarissongcontest/solarisstudio/pull/2390) and [#2391](https://github.com/solarissongcontest/solarisstudio/pull/2391) exercise the original S13 foundation on **synthetic fresh PostgreSQL**. Their tests are useful, but they are not proof of a hosted-head upgrade.
- Existing draft [#2405](https://github.com/solarissongcontest/solarisstudio/pull/2405) independently compared eight hosted S14 relations against clean-source local. The verified comparison found **30 non-parity metadata leaves**, notably two hosted-only direct-write guards, five source-only triggers, three source-only indexes and four table-grant differences with RLS enabled. Those safeguards cannot be deleted simply to make a local comparison green. The donor PR remains separate; do not duplicate its full catalog comparator.
- The S01 snapshot has **selected metadata**, not a complete sanitized schema-only export. **A fully reproducible hosted-head-equivalent fixture cannot be asserted from that evidence alone.**

## Verified local S02 Archive coverage (9 November 2026)

**Actual hosted metadata, not clean-source replay.** Read-only catalog observations produced reviewed schema-only snapshots for **56** S14 Archive-related relations: 45 preflight relations, 2 additional dependencies and 9 external FK/RLS parent relations. The 9 parent schemas are now reconstructed from actual hosted PostgreSQL 17.11 metadata rather than synthetic key-only stand-ins. The original S01 **36 missing hosted history entries and 33 post-head source files** remain observational facts, not reconstructed migration rows.

- **Catalog parity:** all 56 locally imported relations must match the 9 November hosted snapshots field by field, including **858 columns, 381 constraints, 220 indexes, 186 triggers and 137 RLS policies**. This is enforced by `scripts/verify-v3-s02-s14-archive-catalog.mjs` and a separate independent nine-parent comparator. Missing and extra relations or security metadata mismatches fail closed.
- **Privileges:** separate read-only hosted snapshots for all 56 relations and four S14 schemas are reconstructed before the recovery rehearsal. The disposable-local assertion compares **672 CRUD GRANT bits** for `anon`, `authenticated`, and `service_role` and **24 schema `USAGE`/`CREATE` bits**. The dated evidence files are `evidence/s02-hosted-s14-56-table-acls-2026-11-09.json` and `evidence/s02-hosted-s14-schema-acls-2026-11-09.json`; the matching local proof is produced by `scripts/verify-v3-s02-56-acl.mjs`. These checks do not substitute for row-level RLS tests or function `EXECUTE` privilege review.
- **Disposable replay:** the committed `.github/workflows/v3-s02-isolated-hosted-catalog.yml` starts PostgreSQL **17.11** via a reviewed image SHA-256, with `--network none`, no published ports, no hosted endpoints or production rows. It executes the pinned S13 donor `44f6808d4186e51352d3b746e269e75066aa93b9`, then the pinned **S14 Archive** forward-only SQL against locally reconstructed hosted-observed S14 state.
- **Negative cases:** S13 duplicate application and Archive duplicate application are expected to reject; the latter is checked for absence of partial catalog changes. The Archive gate table must deny INSERT to `anon`, `authenticated` and `service_role`.
- **Initial successful exact-SHA S14 rehearsal:** [Actions run #42640938255](https://github.com/solarissongcontest/solarisstudio/actions/runs/42640938255) verified the original 47-table Archive slice. The newer **56-table parity** run is [#42643236484](https://github.com/solarissongcontest/solarisstudio/actions/runs/42643236484); the **56-table role-ACL parity and S13/S14 local replay** are green in [#42644382827](https://github.com/solarissongcontest/solarisstudio/actions/runs/42644382827). Later PR-head runs supersede these exact-SHA results.
- **Important scope limit:** the actual hosted database has **215 tables across `auth`, `public`, `private`, `televoting`** (read-only 9 November inventory). These 56 catalog-observed S14 relations and their function dependencies cannot alone certify **all** hosted state, non-Archive S14 domains, live role behavior, or real data-dependent upgrade correctness. No source-clean replay was substituted.

No database query, migration, network access, secret or production rows are introduced in CI. The positive evidence **never** authorizes deployment or production migration.

## Latest S02 Televote and full-frontier metadata (9 November 2026)

The S02 follow-up PR adds a **separate networkless PG17.11 Televote rehearsal** using pinned S14 donor `01865d823c22897fad84629d984506603885850e`. Fresh **read-only hosted** evidence confirms that `private.v3_televote_result_projection_sources`, `private.v3_guard_source_managed_televote_projection()` and the corresponding `public.televote_votes` trigger were absent, while `public.televote_votes`, `televoting.rounds`, and the existing private service-role helper were present. `.github/workflows/v3-s02-televote-hosted-local.yml` checks the previously verified **56-table** schema and ACL before installing the donor guard/source-truth locally, and rejects a second guard install. The first isolated pass is [Actions #42648489650](https://github.com/solarissongcontest/solarisstudio/actions/runs/42648489650).

The complete **production metadata inventory** (no rows, tokens, URLs, or function bodies copied) is now independently observed and fingerprinted:

- **215** tables in `auth`, `private`, `public`, `televoting`, with **2,364** columns, **1,206** constraints, **669** indexes, **289** noninternal triggers and **255** RLS policies. Per-table SHA-256 fingerprints cover definitions and direct grant bits.
- **727** hosted functions with per-function source SHA-256 fingerprints, security-definer flags and three role-`EXECUTE` privilege bits. Function bodies are **not** exported or imported into the test fixture en masse.
- The existing Archive fixture reproduces **56/215 tables**, leaving **159 tables** unmodelled (26 auth, 9 private, 112 public, 12 televoting). Several functions are installed/rehearsed for specific Archive and Televote paths, but **complete runtime equivalence of the 727-function surface is not proven**.
- `scripts/check-v3-s02-frontier-coverage.mjs` verifies the exact dated head/version and object inventory, refuses unknown/missing names and SHA-256 values, reports the 159-table gap, and **always refuses fullHostedEquivalenceCertified**. Its matching negative tests prevent later engineers from confusing an inventory with a complete local reproduction.

**S02 verdict:** The observed S13/Archive/Televote **scoped** local fixture is usable for those explicitly tested recovery candidates. The stronger claim “entire actual hosted migration-frontier equivalent, across all official writer/reader paths” **cannot be made yet**. Remaining work includes the 159 missing table definitions, complete function/routine dependency and role-runtime closure, remaining S14 Televote/Results and data-dependent regression tests, and explicit independent release certification. No CI job is allowed to connect to hosted Supabase, and the full release remains NO-GO until its separate gates pass.

## Bounded gate added by this candidate

`scripts/check-v3-s02-local-fixture.mjs` reads the committed S01 operator evidence, plus an independently reviewed local-only **schema-only** source file and an operator-created fixture manifest. It checks that every required catalog entry in its limited scope is explicitly true or false, then imports the exact reviewed DDL and runs only `pg_catalog` queries **inside the same newly created networkless PostgreSQL 17.11 container** through `docker exec`. No database port is published. The actual Solaris Studio hosted database was independently checked read-only on 9 November 2026 and returned `server_version = 17.11`, `server_version_num = 170011`; a PostgreSQL 16 fixture is not a version-equivalent baseline.

It checks the eight S14 baseline relations, the absence of five S13 private foundation tables and seven foundation RPC signatures at the observed hosted head, **ten** named object states, **four** notification-delivery direct-grant bits, and notification-delivery RLS. The two hosted-only direct-write guards must be **enabled** and bound to the canonical `private.studio2_guard_direct_client_write()` function; name-only parity is not sufficient. That is **35 explicit predicates**. Unknown catalog objects, extra/missing manifest identities, stale frontier, missing sanitizer attestation, mismatched schema SHA-256, non-local/inherited libpq/Supabase/Docker context aliases, Docker network or port publishing and a different PostgreSQL major all fail closed.

**This checker now owns disposable container startup, SQL import, catalog inspection and cleanup.** It records the resolved local PostgreSQL image ID and import hash, verifies Docker `--network=none`, refuses published ports and writes positive proof only after cleanup. It does **not** authenticate the operator's schema provenance or prove that its contents reproduce every hosted database object. The proof expressly says `fullHostedEquivalenceCertified: false` and `rowUpgradeProven: false`, even when all scoped predicates pass. No production application rows are permitted.

### Inputs that are still required

A separate System/Supabase owner review must produce a sanitized **schema-only** local reconstruction with documented provenance. It must preserve the two hosted-only write guards and reviewed ACL/RLS state, classify unknown dependencies rather than fabricating functions or migration-history rows, and contain no production rows, tokens, passwords, URLs, or other sensitive values. The S02 manifest must explicitly provide:

- `formatVersion: 1`, `fixtureClass: "sanitized-hosted-frontier-s13-s14"`, `reconstruction: "operator-reviewed-hosted-schema"`, `cleanSourceReplay: false`, `schemaOnly: true`, `containsProductionRows: false`, `containsProductionSecrets: false`.
- The exact `hostedHead`, `cutover`, `s01SourceSha`, `postgresMajor: 17`, `postgresImageId` (the exact `sha256:` Docker image ID of the reviewed local `postgres:17.11` image), `sanitizedSchemaSha256`, and independently reviewed `coverageReview` beginning `S13/S14 independently reviewed:`.
- `reconstructionReviewedBy` (nonempty reviewer/owner identity), `reconstructionReviewedAt` (YYYY-MM-DD), and nonempty arrays `assumptions` and `limitations` documenting the reviewed input's reconstruction and what remains unproven. These declarations are included in the proof and **are not independently certified** by the checker.
- Complete maps `relations` (8), `s13Tables` (5), `s13Functions` (7), `namedObjects` (10) and `privileges` (4), using the exact identities from S01 and the verifier's exported allowlists. Every value is a boolean. No missing identities.
- `unknownRequiredObjects: []` **only** when the reviewer has genuinely resolved all required dependencies; do not silently set unknowns to absent.

The verifier cannot certify the reviewer's declaration. Signed evidence of source reconstruction, any required SQL function/trigger body parity, schema import, and S14 upgrade behavior remains a separate S02 completion gate.

## Optional local reproduction (the bounded and expanded checks were executed in GitHub Actions)

On a host with a **local Docker Engine on `/var/run/docker.sock`** and a reviewed sanitized DDL file, first make the exact reviewed PostgreSQL 17.11 image available locally (for example, with an operator-approved `docker pull postgres:17.11`). Record its `sha256:` image ID in the manifest's `postgresImageId` and PostgreSQL minor version; an image-ID mismatch fails before startup. The verifier uses **`--pull=never`**: a missing image is a hard failure, not a reason to switch targets.

The script starts its **own** disposable container with `--network=none`, without published TCP ports, source-directory mounts, production environment files or remote Docker contexts. It imports the reviewed DDL and checks that same process-owned cluster through the internal PostgreSQL Unix socket. It removes the container before writing positive evidence, and refuses a failed cleanup.

Run from the repository root with **all inherited PG*, Docker target and Supabase aliases removed**:

```bash
SOLARIS_S02_DISPOSABLE_CLUSTER=YES SOLARIS_S02_TARGET=local \
  node scripts/check-v3-s02-local-fixture.mjs \
  --manifest /tmp/s02-reviewed-manifest.json \
  --schema /tmp/s02-sanitized-hosted-schema.sql \
  --proof /tmp/s02-scoped-catalog-proof.json
```

Do not run this command with any live production environment variables, secrets or connection strings. Do not use a tunnel or remote Docker daemon: the verifier targets only the local Unix Docker socket and creates the database itself. It **never** fetches a schema or hosted SQL automatically.

The schema SHA-256 in the manifest must match the provided DDL exactly; the imported SQL uses that same byte input. In addition to the 35 checked identities, the output records the image fingerprint, PG17.11 runtime version, documented reconstruction assumptions/limitations and successful container cleanup. An independently verified schema export/source reconstruction and **full** catalog/behavioral comparison remain separate prerequisites.

### Focused negative checks

```bash
bunx vitest run scripts/check-v3-s02-local-fixture.test.mjs
node --check scripts/check-v3-s02-local-fixture.mjs
node --check scripts/check-v3-s02-local-fixture.test.mjs
```

The offline tests exercise manifest identity completeness, known S01 effect mismatches, absent S13 objects, hosted endpoint aliases, PG version drift, and an unknown catalog predicate. They do **not** prove fixture startup or hosted-data compatibility.

## Still required for full hosted-head certification

1. A schema-only, versioned, sanitized local hosted-head reconstruction is supplied and System-owner reviewed. No source-clean equivalence substitution.
2. A **successful networkless disposable PostgreSQL/Supabase-compatible startup and import** with this exact DDL/manifest, followed by 35 predicates, full PR #2405 eight-table shape comparison and an expanded required-object inventory. Unknown required objects must fail.
3. S13/S14 upgrade rehearsal against that actual reconstructed local baseline, including idempotence, transactional failure recovery, RLS/ACL negative cases and no secret/data usage, followed by exact-candidate CI and integrator review.

**No hosted migrations, deployment, production testing, preview/public write enablement, history editing, secret changes, or RLS bypass have been authorized by this task.**