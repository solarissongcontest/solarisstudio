# S13 forward-only foundation recovery candidate

**Status: DRAFT / LOCAL TEST ONLY / NOT A PRODUCTION MIGRATION.**

The live read-only catalog audit of the actual Solaris Studio Supabase project (2026-11-07) confirmed the `private` schema and `private.studio2_request_is_service_role()` exist, `service_role` has schema USAGE, and **all five S13 framework tables and all seven S13 public RPCs are absent**. The SQL Editor reported PostgreSQL **17.11**.

## What this candidate adds

The staged SQL file `forward-only-s13-foundation.sql` contains:

1. A strict 12-object preflight: abort if the private authority helper or service schema usage is missing, or **any** S13 target table or routine already exists. It cannot blindly overwrite a partially applied S13 installation.
2. The original immutable `20261019111000_v3_s13_migration_hardening.sql` core, byte-for-byte apart from the surrounding transaction wrapper. This defines the five registries/backfill/parity tables, seven public RPCs, required grants and baseline seed records.
3. An additive, migration-owner registration record for `v3.s13.strict-registration-restore`, followed by the **strict final** registration function and ACL from `20261019113300_v3_s13_strict_registration_restore.sql`. The temporary S6 filename aliases from `20261019112900` are **not** installed, since future recovered S6 code must use reviewed semantic keys instead of replaying the historical alias window.
4. Atomic postconditions covering five tables, seven RPCs, service-role EXECUTE and the absence of anonymous/authenticated EXECUTE on the registration RPC.

No historical migration version is marked applied, and no existing record is updated. The file lives under `docs/v3/recovery-candidates/` so it is not an automatically deployable migration.

## What the isolated test proves

`.github/workflows/v3-s13-forward-recovery-local.yml` launches disposable **PostgreSQL 17** over loopback. The shell rehearsal creates its own database, installs local roles and a synthetic equivalent of the existing service-role predicate, and applies **only this candidate**. It checks the complete S13 catalog, service-only access, immediate strict-key rejection, migration contract replay, duplicate execution rejection without changing existing contract records, and disposal of the database. A source-integrity Vitest contract pins the candidate to the original S13 framework and strict registration implementation.

**The test uses a synthetic fixture, not the actual hosted schema and data.** Even if CI turns green, that alone does not prove a hosted-head-equivalent upgrade, verified function-body parity, grants/RLS under the full V3 permission engine, live legacy-data compatibility, or resolution of the other missing migration effects.

## Remaining blockers before production

- Review the candidate against an isolated **sanitized hosted-head-equivalent** PostgreSQL/Supabase schema, preserving the existing `private.studio2_request_is_service_role` and all actual dependent routines.
- Audit the remaining 36 historical missing-history effects, S6 notification repairs, S14 Televote/Archive, immutable Results, and all 32 newer pending migrations. Their dependencies must be compatible with the canonical strict S13 registration policy.
- Obtain local clean-replay and upgrade parity, negative authorization tests, recovery/rollback and exact-SHA release verification.
- Create a NEW versioned migration with `supabase migration new` **only after** those local proofs and System/migration-owner review. Never replay the old historical file to falsify migration-history parity.
- Require separate **explicit owner permission** for any hosted database DDL, migration-history write, feature flag, merge or deployment. This PR does not grant it.

**Operator instructions today: run no write SQL in production.** This is a reviewed starting point for test-driven repair, not a copy/paste deployment script.
