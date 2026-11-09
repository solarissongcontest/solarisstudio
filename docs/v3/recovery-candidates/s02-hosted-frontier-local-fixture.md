# S02: isolated hosted-frontier fixture preflight (candidate, not certification)

**Task:** S02 only. **Status:** PARTIAL / BLOCKED awaiting an approved, sanitized hosted-head schema reconstruction and disposable-database execution. This document is **not** permission to deploy, run hosted SQL, change migration history, or lift production maintenance.

## Evidence and inherited constraints

- S01 has been merged to current main via [#2422](https://github.com/solarissongcontest/solarisstudio/pull/2422). Its [dated 9 November inventory](./evidence/s01-hosted-source-delta-2026-11-09.md) records source history and bounded hosted catalog observations: hosted head `20261101181812`, cutover `20261014020000`, **36** post-cutover history holes and **33** later source files. An absent migration-history record does not prove the complete SQL effect absent.
- Existing draft [#2390](https://github.com/solarissongcontest/solarisstudio/pull/2390) and [#2391](https://github.com/solarissongcontest/solarisstudio/pull/2391) exercise the original S13 foundation on **synthetic fresh PostgreSQL**. Their tests are useful, but they are not proof of a hosted-head upgrade.
- Existing draft [#2405](https://github.com/solarissongcontest/solarisstudio/pull/2405) independently compared eight hosted S14 relations against clean-source local. The verified comparison found **30 non-parity metadata leaves**, notably two hosted-only direct-write guards, five source-only triggers, three source-only indexes and four table-grant differences with RLS enabled. Those safeguards cannot be deleted simply to make a local comparison green. The donor PR remains separate; do not duplicate its full catalog comparator.
- The S01 snapshot has **selected metadata**, not a complete sanitized schema-only export. **A fully reproducible hosted-head-equivalent fixture cannot be asserted from that evidence alone.**

## Bounded gate added by this candidate

`scripts/check-v3-s02-local-fixture.mjs` reads the committed S01 operator evidence, plus an independently reviewed local-only **schema-only** source file and an operator-created fixture manifest. It checks that every required catalog entry in its limited scope is explicitly true or false, then runs only `pg_catalog` queries through `psql` on `127.0.0.1` using PostgreSQL 16.

It checks the eight S14 baseline relations, the absence of five S13 private foundation tables and seven foundation RPC signatures at the observed hosted head, **ten** named object states, **four** notification-delivery direct-grant bits, and notification-delivery RLS. That is **35 explicit predicates**. Unknown catalog objects, extra/missing manifest identities, stale frontier, missing sanitizer attestation, mismatched schema SHA-256, non-local/inherited libpq/Supabase aliases and different PG major all fail closed.

**This checker does not construct a database, import the schema SQL, or prove the supplied schema file produced the inspected database.** An operator must separately materialize the reviewed sanitized DDL into a fresh disposable local PostgreSQL/Supabase-compatible stack and record that startup/import evidence. The proof emitted here expressly says `fullHostedEquivalenceCertified: false` and `rowUpgradeProven: false`, even if all scoped predicates pass. No application rows are needed or permitted.

### Inputs that are still required

A separate System/Supabase owner review must produce a sanitized **schema-only** local reconstruction with documented provenance. It must preserve the two hosted-only write guards and reviewed ACL/RLS state, classify unknown dependencies rather than fabricating functions or migration-history rows, and contain no production rows, tokens, passwords, URLs, or other sensitive values. The S02 manifest must explicitly provide:

- `formatVersion: 1`, `fixtureClass: "sanitized-hosted-frontier-s13-s14"`, `reconstruction: "operator-reviewed-hosted-schema"`, `cleanSourceReplay: false`, `schemaOnly: true`, `containsProductionRows: false`, `containsProductionSecrets: false`.
- The exact `hostedHead`, `cutover`, `s01SourceSha`, `postgresMajor: 16`, `sanitizedSchemaSha256`, and independently reviewed `coverageReview` beginning `S13/S14 independently reviewed:`.
- Complete maps `relations` (8), `s13Tables` (5), `s13Functions` (7), `namedObjects` (10) and `privileges` (4), using the exact identities from S01 and the verifier's exported allowlists. Every value is a boolean. No missing identities.
- `unknownRequiredObjects: []` **only** when the reviewer has genuinely resolved all required dependencies; do not silently set unknowns to absent.

The verifier cannot certify the reviewer's declaration. Signed evidence of source reconstruction, any required SQL function/trigger body parity, schema import, and S14 upgrade behavior remains a separate S02 completion gate.

## Local-only operator procedure (NOT executed by this candidate)

On a computer with **Docker, PostgreSQL client and a reviewed sanitized DDL**, create an isolated disposable PostgreSQL 16 container. All published ports bind only to loopback. Use a unique container name and immediately destroy it after the check. Do not mount the repository's production `.env` or any hosted credentials.

```bash
docker run --rm -d --name solaris-s02-isolated \
  -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54399:5432 postgres:16
# After the local container is healthy, import the independently reviewed
# schema-only fixture explicitly into that disposable local database:
PGPASSWORD=postgres psql -w -X -h 127.0.0.1 -p 54399 \
  -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/s02-sanitized-hosted-schema.sql

# Run in a CLEAN environment; unset all inherited PG*/SUPABASE*/DATABASE_URL aliases.
SOLARIS_S02_DISPOSABLE_CLUSTER=YES SOLARIS_S02_TARGET=local \
SOLARIS_S02_PGPORT=54399 node scripts/check-v3-s02-local-fixture.mjs \
  --manifest /tmp/s02-reviewed-manifest.json \
  --schema /tmp/s02-sanitized-hosted-schema.sql \
  --proof /tmp/s02-scoped-catalog-proof.json

docker rm -f solaris-s02-isolated
```

The `--schema` file is hashed; the checker does **not** independently bind the physical schema-import operation to that file. Preserve a reviewed, exact-input import log for this gap. Use fresh disposable infrastructure only; do not connect a local port forward to a hosted database.

### Focused negative checks

```bash
bunx vitest run scripts/check-v3-s02-local-fixture.test.mjs
node --check scripts/check-v3-s02-local-fixture.mjs
node --check scripts/check-v3-s02-local-fixture.test.mjs
```

The offline tests exercise manifest identity completeness, known S01 effect mismatches, absent S13 objects, hosted endpoint aliases, PG version drift, and an unknown catalog predicate. They do **not** prove fixture startup or hosted-data compatibility.

## Remains blocked until

1. A schema-only, versioned, sanitized local hosted-head reconstruction is supplied and System-owner reviewed. No source-clean equivalence substitution.
2. A **successful disposable PostgreSQL/Supabase startup and import** with this exact DDL/manifest, followed by 35 predicates, full PR #2405 eight-table shape comparison and an expanded required-object inventory. Unknown required objects must fail.
3. S13/S14 upgrade rehearsal against that actual reconstructed local baseline, including idempotence, transactional failure recovery, RLS/ACL negative cases and no secret/data usage, followed by exact-candidate CI and integrator review.

**No hosted migrations, deployment, production testing, preview/public write enablement, history editing, secret changes, or RLS bypass have been authorized by this task.**