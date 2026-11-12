# S13 forward-only foundation recovery candidate

**Status: DRAFT / LOCAL TEST ONLY / NOT A PRODUCTION MIGRATION.**

The live read-only catalog audit of the actual Solaris Studio Supabase project (2026-11-07) confirmed the `private` schema and `private.studio2_request_is_service_role()` exist, `service_role` has schema USAGE, and **all five S13 framework tables and all seven S13 public RPCs are absent**. The SQL Editor and independent read-only system-catalog query reported PostgreSQL **17.11**. A second read-only query verified **all 12** S13 targets absent.

## What this candidate adds

The staged SQL file `forward-only-s13-foundation.sql` contains:

1. A strict **14-name preflight**: abort if the private authority helper or service schema usage is missing, or **any** of the five target S13 tables, seven target RPCs, or two planned index names already exists. The helper must also match either the observed PG17.11 definition or the newer canonical scalar/JSON JWT definition from `20261102205000_v3_service_role_claim_compatibility.sql`, with the reviewed ACL fingerprint and `postgres` owner. Both exact contracts are exercised; no unknown body/owner/grant is accepted merely because its name exists. It cannot blindly overwrite a partially applied S13 installation.
2. The original immutable `20261019111000_v3_s13_migration_hardening.sql` core, byte-for-byte apart from the surrounding transaction wrapper. This defines the five registries/backfill/parity tables, seven public RPCs, required grants and baseline seed records.
3. An additive, migration-owner registration record for `v3.s13.strict-registration-restore`, followed by the **strict final** registration function and ACL from `20261019113300_v3_s13_strict_registration_restore.sql`. The temporary S6 filename aliases from `20261019112900` are **not** installed, since future recovered S6 code must use reviewed semantic keys instead of replaying the historical alias window.
4. Atomic postconditions covering five tables, seven RPCs, service-role EXECUTE and the absence of anonymous/authenticated EXECUTE on the registration RPC.

No historical migration version is marked applied, and no existing record is updated. The file lives under `docs/v3/recovery-candidates/` so it is not an automatically deployable migration.

## What the isolated test proves

`.github/workflows/v3-s13-forward-recovery-local.yml` launches disposable **PostgreSQL 17.11** over loopback. The shell rehearsal creates its own database and installs local roles using `fixtures/s13-production-dependency-subset-20261107.sql` instead of an invented security helper. This fixture is based on bounded **read-only** production metadata and pins the real `private.studio2_request_is_service_role()` definition fingerprint, function-ACL fingerprint, schema-level USAGE grants, owner, search path and SQL invoker semantics. **No production rows, credentials or hosted endpoints enter CI.**

The rehearsal compares the forward-recovery S13 objects to the **original three-stage S13 migration sequence**, executed in a second disposable DB cloned from the same production-observed dependency fixture. It hashes the definitions and ACLs of all seven public S13 RPCs, plus five private tables' columns, constraints, indexes, owners and privileges. It checks strict registration and tests authorization, replay refusal, and **eight failure states**: missing authority helper, missing schema privilege, altered helper body, altered helper ACL, altered helper owner, pre-existing S13 table, pre-existing S13 RPC and collision with a planned S13 index name. Failures must abort without introducing S13 objects. It also verifies browser-role denial and direct-write denial for the service role.

The helper-body case was reproduced against the earlier staged candidate: it
accepted a same-signature helper returning `true`. This demonstrates an unsafe
dependency-preflight acceptance, not a hosted exploit. The correction adds only
metadata preconditions; it neither changes the helper nor introduces new
authorization, grants or canonical writers. Fingerprints are catalog-drift checks
against the frozen reviewed fixture, not cryptographic actor authentication.
The newer canonical helper is extracted verbatim from its immutable source SQL
for the late-interruption probe; recovery preserves that helper rather than
downgrading it. A separate fresh-schema positive probe reuses the S02 prerequisite
file and verifies its observed postgres-only helper ACL and resulting S13 catalog.

The original three-stage S13 history creates **three** registration keys (foundation, temporary context, strict restore), whereas forward-only recovery intentionally creates **two** because the temporary migration window was not executed. This is a **known semantic/history difference**, not a history repair. Full reconciliation must account for it explicitly.

**This reproduces only the production-observed S13 dependency subset, not the complete hosted schema and data.** Even with green CI, it cannot establish hosted-head-equivalent upgrade safety, overall real contest-data compatibility, all grants/RLS under the full V3 permission engine, or resolution of the other missing migration effects. Historical migration-history versions must never be fabricated or marked applied.

## S03 targeted retry and version-conflict checks (9 November 2026)

The enhanced `scripts/rehearse-v3-s13-forward-recovery-local.sh` explicitly checks **two different already-present cases**. When a partial installation/name collision exists, the preflight rejects it without creating S13 objects. In the disposable RPC-collision scenario, the synthetic conflicting stub is removed and a **new `psql` session applies the same candidate successfully to that same local database**, proving restart/retry after an aborted preflight. When all S13 objects are already installed, the candidate deliberately **rejects the second execution rather than silently replacing SECURITY DEFINER functions**. Catalog, migration-contract rows, and schema-compatibility rows are fingerprinted before and after the rejection and must remain identical. This is a *non-mutating rejected retry*, **not** a successful idempotent SQL replay.

The rehearsal also rejects and checks non-mutation for (a) a previously registered migration key with a conflicting schema version, and (b) an active backfill job with a conflicting definition version. It explicitly checks direct SELECT/INSERT/UPDATE/DELETE grants for all five private S13 tables against `anon`, `authenticated`, and `service_role`. Their original-source RLS posture is **RLS disabled, no policies, direct DML denied**; privileged actions remain gated through the reviewed SECURITY DEFINER RPCs and service-role request helper. This preserves historical migration boundaries rather than secretly adding a different RLS implementation.

**S02 prerequisite:** [#2423](https://github.com/solarissongcontest/solarisstudio/pull/2423) and [#2424](https://github.com/solarissongcontest/solarisstudio/pull/2424) were merged with isolated PostgreSQL 17.11 / hosted-observed partial catalog evidence. That fixture explicitly covers 56/215 hosted-observed tables and cannot certify the complete hosted database or every 727-function runtime dependency. S03's dedicated S13 dependency-subset fixture remains narrower; do not label its green run as full hosted-head upgrade certification. No hosted SQL is ever exercised by this PR.

The source historical migration sequence remains exactly three files; no historical file or `supabase_migrations.schema_migrations` entry is changed. The candidate intentionally retains only two semantic S13 registration keys and no transient S6 alias key. Full production frontier repair, migration packaging, and any hosted execution require separate review and explicit approval.

## Interrupted-session recovery acceptance

The S13 rehearsal also terminates its **own disposable PostgreSQL session** at
two verified points in a temporary copy: after all five tables exist, and just
before commit after all seven RPCs and both registry records exist. A failure
before the intended point does not count as a passing interruption. Fresh
connections must observe the identical baseline catalog, ownership, ACLs,
columns, constraints, indexes, default privileges, RLS policies, triggers and
synthetic rows. The unchanged candidate is then retried in that same database;
its S13 catalog must match the normally recovered database. An existing synthetic
row-filter policy and write-denying trigger must still enforce their boundaries.

The workflow pins **PostgreSQL 17.11**, matching the fixture's strict version and
helper fingerprints. These tests prove transactional rollback and restart on the
**observed S13 dependency subset**, with additional synthetic preservation
sentinels. They do not reconstruct the remaining hosted schema/data, prove an
operating-system crash or interrupted durable COMMIT, or authorize adoption.
No recovery candidate SQL or historical migration is modified by fault injection.

## Remaining blockers before production

- This test uses the **exact S13 external helper definition/ACL and schema-usage footprint** observed in production. Still build/review an isolated **sanitized hosted-head-equivalent** PostgreSQL/Supabase schema including other schemas, caller routines and representative synthetic data shapes.
- Audit the remaining 36 historical missing-history effects, S6 notification repairs, S14 Televote/Archive, immutable Results, and all 32 newer pending migrations. Their dependencies must be compatible with the canonical strict S13 registration policy.
- Obtain local clean-replay and upgrade parity, negative authorization tests, recovery/rollback and exact-SHA release verification.
- Create a NEW versioned migration with `supabase migration new` **only after** those local proofs and System/migration-owner review. Never replay the old historical file to falsify migration-history parity.
- Require separate **explicit owner permission** for any hosted database DDL, migration-history write, feature flag, merge or deployment. This PR does not grant it.

**Operator instructions today: run no write SQL in production.** This is a reviewed starting point for test-driven repair, not a copy/paste deployment script.
