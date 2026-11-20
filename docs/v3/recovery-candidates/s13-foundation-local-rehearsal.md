# V3 S13 foundation: isolated local prerequisite rehearsal

**Status: LOCAL-ONLY SOURCE REPLAY; NOT A MIGRATION, NOT A FORWARD-FIX, NOT PRODUCTION AUTHORIZED.**

This prepares the next critical recovery lane after the [migration-frontier preflight](../production-frontier-preflight.md), the [full divergence matrix in draft PR #2387](https://github.com/solarissongcontest/solarisstudio/pull/2387), and the narrower draft HTTP409 recovery PR #2388.

## Why S13 comes next

A verified read-only catalog check of the Solaris Studio hosted project on **2026-11-07** found **all five original S13 private foundation tables absent**:

- `private.v3_migration_contracts`
- `private.v3_schema_compatibility`
- `private.v3_schema_compatibility_history`
- `private.v3_backfill_jobs`
- `private.v3_migration_parity_runs`

All **seven original S13 functions** are absent, too: `v3_schema_compatibility`, `v3_register_migration_contract`, `v3_claim_backfill`, `v3_checkpoint_backfill`, `v3_fail_backfill`, `v3_record_migration_parity`, and `v3_set_schema_compatibility`. The existing prerequisite `private.studio2_request_is_service_role` is **present**. This is evidence of core missing SQL effects, not a grant to replay the historical file in production.

Newer S14 Results/Televote and other migrations call the missing `v3_register_migration_contract`; applying them before the foundation fails. **Restoring that foundation must precede subsequent contract registrations**.

## What this PR tests

The exact existing source `supabase/migrations/20261019111000_v3_s13_migration_hardening.sql` is executed against a deliberately **fresh disposable PostgreSQL container**, using a minimal synthetic stand-in for the already-present service-role helper. The test checks:

1. The five expected tables and seven RPC signatures are created.
2. The initial schema compatibility singleton and bootstrap contract exist exactly once.
3. The registration command is callable by the test service role, not by `anon` or `authenticated`.
4. The service role cannot bypass canonical command integrity through direct inserts into the private migration-contract table.
5. The registration RPC supports semantic replay of an identical local-only contract.
6. A second local source execution does not duplicate S13 initial state.
7. The disposable test database and test roles are removed.

This uses **only localhost PostgreSQL** and an explicit opt-in flag. It refuses a cluster with pre-existing user databases or Supabase roles, so it is not appropriate for your working local Supabase instance, a linked project, or any production system.

### Local-only operator invocation

With a fresh *disposable* PostgreSQL 16 cluster listening at 127.0.0.1:54322 and the `psql` client:

```sh
SOLARIS_S13_DISPOSABLE_CLUSTER=YES \
SOLARIS_LOCAL_DB_PORT=54322 \
SOLARIS_LOCAL_DB_PASSWORD=postgres \
node scripts/rehearse-v3-s13-foundation-local.mjs
```

Alternatively, review the path-scoped CI run in `.github/workflows/v3-s13-foundation-local-recovery.yml`, which creates and destroys its own PostgreSQL service. **Never forward a hosted database port to the test's loopback address.**

## What remains before any actual forward-only S13 migration

- Compare all source S13 DDL, constraints, permissions, default privileges and function definitions to a **sanitized hosted-head-equivalent local baseline**.
- Confirm there is no conflicting historical S13 state hidden behind a different name or another owner.
- Model the registration-context window and strict-registration restoration from the other missing S13 scripts; the first foundation file is only one dependency.
- Add local Supabase-specific role/RLS and negative authorization tests, beyond the deliberately simplified synthetic helper here.
- Validate preconditions against current canonical source and reviewed hosted version, then create **new forward-only versioned migration(s)** with the Supabase CLI. Do not repurpose the old timestamp or mark it applied to silence the comparator.
- Prove later S14/Results/Televote and eventual release-gate compatibility; preserve historical contest data and provenance.
- Obtain **separate explicit production approval** before any hosted database schema changes.

**This PR does not modify production Supabase, add a tracked migration, alter hosted history or change application behavior. Production migrations remain NO-GO.**
