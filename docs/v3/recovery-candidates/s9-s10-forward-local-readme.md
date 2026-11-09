# S9 + S10 observability / SLI forward-effects recovery | LOCAL TEST ONLY

**Draft, not a Supabase migration, not authorized for production.** The two candidate files are intentionally under `docs/v3/recovery-candidates/`, not the deployable `supabase/migrations/` directory. Do not paste into Supabase SQL Editor.

## Current read-only evidence (2026-11-07)

The actual Solaris Studio PostgreSQL instance has canonical `public.studio2_operation_receipts`, `private.v3_domain_events`, `private.v3_domain_event_outbox`, and the `public.studio2_access_allowed(text,uuid,boolean)` authority function. Both target public functions `admin_system_observability_snapshot(integer)` (S9) and `admin_system_v3_sli_snapshot(integer)` (S10) are **absent**. All three intended S9 time-leading index names are **absent**, although the three ledgers already have **13 other indexes** combined. S13 contract registration is also absent, so S10 cannot be independently deployed.

Read-only catalog inspection also measured CURRENT data-file sizes (a snapshot, **not** guarantees about later table growth):

| Canonical ledger | Approximate heap size | Existing index size | Total size | Catalog row estimate |
| --- | ---: | ---: | ---: | ---: |
| `public.studio2_operation_receipts` | 24 kB | 80 kB | 136 kB | 29 |
| `private.v3_domain_events` | 16 kB | 80 kB | 128 kB | unknown (-1) |
| `private.v3_domain_event_outbox` | 8 kB | 40 kB | 56 kB | 58 |

These are low-overhead `pg_relation_size`/`pg_indexes_size` catalog measurements; no production records were fetched. They do **not** establish the future index build's lock wait, impact on in-flight official contest operations, or safe deployment window. Even if an index completes quickly, its ordinary transactional DDL can still queue concurrent writers.

Read-only catalog inspection confirmed the relevant ledger columns and the RLS state of the receipts table; see `fixtures/s9-s10-production-ledger-subset-20261107.sql`. The local fixture reproduces **only the needed columns and broad security shape**, not all production constraints, policies, foreign keys or other application tables. It seeds **synthetic** records containing explicit privacy canaries. There are no real contest rows, user IDs, secrets or hosted connection strings in this PR.

## Forward-only effect candidates

1. `forward-only-s9-indexes-concurrent-local.sql`: standalone `CREATE INDEX CONCURRENTLY` stage for exactly three canonical S9 definitions, performed **outside an explicit transaction** with fail-closed collision and validity checks. A partial failure can leave an invalid index and requires operator intervention; never blindly retry.
2. `forward-only-s9-observability-local.sql`: fail-closed preflight for required ledger tables/columns, permission helper, absent S9 RPC and the three **already-valid concurrent indexes**. The canonical **S9 function, ACL and comments are unchanged** from `20261019110000_v3_s9_safe_metrics.sql`; only its three original index commands were extracted to the separate stage. The RPC is installed within a bounded transaction.
3. `forward-only-s10-sli-local.sql`: fail-closed preflight for S9 RPC, canonical S13 contract registration, absent S10 RPC; then the **unchanged canonical S10 source SQL** from `20261019112000_v3_s10_sli_snapshot.sql` within a bounded transaction. S10 derives all numerical measurements from S9. It does not introduce an independent raw-ledger reader or set alert targets.
4. `scripts/rehearse-v3-s9-s10-forward-local.sh`: disposable local PostgreSQL test. It explicitly verifies S10 rejection without S9, installation and rerun rejection of the standalone **concurrent index stage**, rejection without S13, installation of canonical **original source S13** migrations locally, S10 registration, repeat-run refusal, authorization checks, realistic synthetic counts, privacy-canary nonleakage, window validation and cleanup.
5. `.github/workflows/v3-s9-s10-forward-local.yml`: GitHub Actions isolated PostgreSQL 17.11 on loopback; explicit refusal of production credentials/DB host/environment, exact reviewed SHA checkout and cleanup.
6. `src/lib/v3-s9-s10-forward-recovery.contract.test.ts`: static source-integrity and privacy/authorization assertions.


## S04 scope and S02/S03 adoption (9 November 2026)

The S02 bounded hosted-observed fixture gate was source-integrated through [#2423](https://github.com/solarissongcontest/solarisstudio/pull/2423) and [#2424](https://github.com/solarissongcontest/solarisstudio/pull/2424); S03's **local-only** S13 foundation was source-integrated through [#2393](https://github.com/solarissongcontest/solarisstudio/pull/2393). None of these merges applies its recovery SQL to hosted Supabase. S02 models only 56 of 215 observed tables, and has not reproduced all 727 routine behaviors. Consequently, S04's synthetic S2/S4 ledger fixture proves a **narrow local S9/S10 runtime and privacy contract**, not complete hosted-head-equivalent recovery.

The focused S04 rehearsal exercises missing-index refusal, a one-index partial-install collision, explicit local-only cleanup and retry, complete three-index catalog shapes (including table, key order, readiness and validity), S9/S10/S13 ordering, and a fingerprint comparison proving rejected repeat executions do not change the two RPC definitions, index definitions or S10 registration count. **A rejected replay is fail-closed idempotency, not a successful SQL no-op.** The first index drop occurs only in a disposable synthetic PostgreSQL database; production operators must not copy that recovery procedure without a separate risk review.

The concurrent index stage is a proposed local proof, **not** a safe production roll-forward plan. Real hosted DB reconciliation still needs an explicit partial-index recovery procedure, lock/statement/transaction budget, complete dependency/authorization review, migration owner approval and separate deployment permission. No SLO targets, dashboards, alerts or other observability platform work is implied by S04.

## Important limits

- **Index concurrency and recovery:** The staged local design now **separates** the three indexes into `CREATE INDEX CONCURRENTLY`, outside a transaction, before the S9 function transaction. Concurrent builds reduce ordinary writer blocking but can still wait for transactions and can leave an **invalid partial index** if interrupted. The preflight intentionally refuses any existing index name, valid or invalid. An actual production rollout needs a lock/wait budget, documented recovery for partial completion, and owner approval; these scripts remain **non-deployable candidates**.
- **Authorization fidelity:** The local `studio2_access_allowed` is a *deliberate restricted stub* based on a fake `request.jwt.claim.role`. It demonstrates that S9/S10 honour a denied capability, but does not reproduce the real delegated-role/edition authorization engine. A full hosted-head-equivalent, isolated local schema with the actual function body and representative synthetic data is still required before production.
- **History divergence:** S9/S10 existing source files lack corresponding hosted migration-history entries. Do **not** claim those versions applied, `migration repair` their IDs, or replay 36 missing-history files blindly. The candidate carries effects for a possible **newly versioned forward-only migration** after local proof and approval.
- **Dependency order:** S13 recovery must be independently validated, approved and integrated *before* S10; S9 independently precedes S10. This PR is a review-only dependency lane, not an instruction to merge, deploy or change feature flags.
- **Privacy:** S9 exposes only aggregate counts, timings and **error-code categories**, not row payloads, actor IDs, error metadata, or raw voting results. A synthetic canary test is a minimum baseline, not a substitute for a full privacy/security audit.

**No production Supabase query in CI or Playwright. No production writes in this session. No release certification, no merge, no deployment approval.**
