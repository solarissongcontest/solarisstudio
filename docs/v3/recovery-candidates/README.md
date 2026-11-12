# Local-only forward HTTP409 recovery candidate (V3)

**Status:** DRAFT CODE, **not tested on PostgreSQL in this session**, **not certified**, **not a migration**, **not deployment-authorized**.
**Based on:** main `c43a580e9b71dd0bbc0f42668870e90e71bb6bf7`, read-only production catalog observations on 2026-11-07, and the existing source migrations `20261018024500` and `20261018031000`.

This is the **first bounded implementation slice** after the [production-frontier preflight](../production-frontier-preflight.md) and the [unmerged evidence matrix in draft PR #2387](https://github.com/solarissongcontest/solarisstudio/pull/2387) (draft PR #2387), **not a fix for all 36 missing-history gaps**. All S13/S14 Televote/Archive/Results and 32 pending-migration blockers remain.

## Why this slice

Production catalog checks confirm that the 28 functions named by `20261018031000_v3_http409_deterministic_conflicts.sql` and the separate Confirmation Entry-review function exist but still contain the deterministic conflict SQLSTATE `'40001'` and not `'PT409'`. PostgREST 14 can treat `40001` as transient and retry; stale user operations should return 409 without being re-executed. The shared DomainEvent worker is intentionally **excluded**: its true lease/serialization retry code must remain `40001`.

This candidate is authored as a **new forward-only recovery**, *not* a copy of the missing historical migration. It:
- Explicitly lists the original 28 allowlisted canonical signatures plus the Entry-review signature.
- Fails closed for missing functions, ambiguous mixed SQLSTATE markers or unknown function bodies.
- Replaces the old error-state literal **only** when the exact allowlisted function currently has `'40001'` and no `'PT409'`. Functions already using `'PT409'` are not rewritten, supporting clean-source replay and repeat execution.
- Rechecks every definition and original function owner/ACL/security configuration; verifies the DomainEvent worker is unchanged.
- Performs all replacements in one transaction; an error rolls the whole candidate back.
- Does not alter application tables, existing votes, results, accounts, privileges, policies, RLS, feature flags or the migration-history table.
- Is intentionally stored under `docs/v3/recovery-candidates/` rather than `supabase/migrations/` to **prevent accidental deployment**.

## Isolated local rehearsal (operator)

Requirements: an *already-running* **LOCAL/loopback** PostgreSQL instance with privileges to create disposable databases, a local `psql` binary, Node.js, and *no* production credentials. The script uses **127.0.0.1 only**, never the `SUPABASE_URL` or `DATABASE_URL` environment variables, and creates/drops its own `solaris_v3_http409_<pid>` test database. Never tunnel or forward this local port to a hosted/production database.

```sh
SOLARIS_RUN_LOCAL_DB_REHEARSAL=YES \
SOLARIS_LOCAL_DB_PORT=54322 \
node scripts/rehearse-v3-http409-recovery-local.mjs
```

A local Supabase instance usually exposes its Postgres port on 54322; use the actual local port if different. The script's default local password is `postgres`; if the local fixture uses a different password, set `SOLARIS_LOCAL_DB_PASSWORD` for **the local instance only**.

The rehearsal explicitly checks:

1. Old `40001` fixture → `PT409` in **all 29 allowlisted functions**.
2. Second application is idempotent against already-normalized code.
3. Missing *last* allowlist function causes atomic rollback of earlier rewrites.
4. Mixed `40001`/`PT409` in a function fails closed.
5. DomainEvent worker retains genuine `40001`.

The Node script **does not contact production**. These are minimal synthetic definitions, not a hosted-head-equivalent clone; passing only proves important SQL behavior in disposable local Postgres. It does not prove that real current function bodies, ACLs, HTTP transport through local PostgREST, dependency chains, or historical contest data are compatible.

## Additional local HTTP transport check

The path-scoped [isolated PostgreSQL CI workflow](../../../.github/workflows/v3-http409-forward-repair-local.yml) also starts a *temporary* loopback PostgREST **v14.18** container. It creates an isolated synthetic RPC that raises `PT409`, verifies the HTTP response status is **409** with the expected error code, and destroys the container. This establishes the PostgREST error-code mapping separately from the 29-function SQL rewrite.

**This does not exercise the real Confirmation or Results RPC body through the hosted API and does not certify hosted compatibility.** The workflow must not receive production credentials or contact a non-loopback database.

## Required steps **before creating a versioned forward-only migration**

1. Verify complete definition and caller equivalence of these 29 hosted functions against the reviewed source, not just presence of a string. Check privileges, exception-handler semantics, overloads and dependency changes.
2. Run the synthetic local rehearsal and the Vitest source contract tests:
   `bunx vitest run src/lib/v3-forward-only-conflict-reconciliation.contract.test.ts`.
3. Build the sanitized hosted-head-equivalent local Supabase fixture required by the master frontier; rehearse the candidate **there** with the real function bodies. Check permissions, idempotent retries, optimistic-version rejection, receipt reconciliation and real **HTTP 409 via local PostgREST**.
4. Verify genuine DomainEvent worker retry and lease behavior remains intact.
5. Obtain a System/migration-owner review. Create an approved new versioned migration **with `supabase migration new`**, then port the *validated* SQL into it; add local migration-chain tests. Retain the old 36 history entries unmodified and unresolved until separately reconciled.
6. Keep `scripts/v3-production-supabase-push.sh` and its exact-SHA pins **unchanged** until full production-frontier audit and release certification pass.
7. Obtain **separate explicit owner approval** before any production schema write or rollout.

## What this does *not* do

- It does **not** apply any schema changes to hosted Supabase or record migration history.
- It does **not** repair missing S13 migration registration, S14 Archive or Televote guards, Results snapshots or publication schedulers.
- It does **not** establish that `solaris_app_v3_confirmation` currently causes visible user errors.
- It does **not** authorize merge/deploy of unfinished recovery SQL.

**NO-GO remains in force for hosted V3 migrations until complete history and effects parity are demonstrated.**
