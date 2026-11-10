# S14 Archive integrated forward-effect recovery | local rehearsal candidate

**STATUS: DRAFT / NOT A DEPLOYABLE MIGRATION / NEVER RUN ON HOSTED SUPABASE.**

This bundle is the next dependency step after the previous read-only hosted migration gap audit and the passing one-shot authorization and cross-edition task isolation tests in PR #2400. It is deliberately located outside `supabase/migrations/` and cannot be picked up by an ordinary `supabase db push`.

## Read-only evidence from the actual hosted database

Metadata-only queries on the correct Solaris Studio Supabase project found:

- PostgreSQL 17.11. All **16 named prerequisite relations** for the Archive recovery are present, including edition runtime, organizer tasks, notifications and delivery history, operation receipts, S4 domain events/outbox, results operations, Next in Line, eligibility, Televote bindings and canonical rounds.
- **S13 `private.v3_migration_contracts` and `public.v3_register_migration_contract` are absent.** That is a hard dependency and makes the current candidate intentionally inapplicable to production.
- The existing `private.studio2_reconcile_all_organizer_tasks(uuid)` and `private.studio2_prune_stale_task_notifications(uuid)` are present, postgres-owned (read-only definition MD5 fingerprints `756db08b6994b189992bd527f97c4b37` and `f059ed84963db4bbde4dd3e5ee59fd9e` respectively). The existing `public.studio2_transition_edition_v2(uuid,text,text,uuid)` is also present.
- The Archive-only public v3 transition, private implementation, task guard, runtime transition gate, Task reconciliation gate, published-results readiness helper, Archive consequence consumer, private helpers, and related guard triggers were observed absent. Nine named Archive trigger identities have **zero** matches on any relation.
- These are **catalog observations**, not a dump of private data. No edition state, vote, task, user, result, delivery or receipt rows were fetched or changed.

## Source-required dependencies, checked against hosted pg_catalog

A second, narrowly scoped **read-only** hosted PostgreSQL catalog audit verified **21 external helper RPC signatures** required by the S14 Archive source, including operation receipts, edition lifecycle risk, task/notification reconciliation, public permission checks, DomainEvent emission and the **exact immutable Final Results release-readiness check**. All were present before S13 recovery. It also verified the referenced Results publication tables, eleven canonical Televote workflow stores and twenty existing public workflow tables. Two optional legacy public stores, `public.televotes` and `public.televoting_windows`, are absent and remain intentionally optional in the canonical migration's conditional guard loop.

The staged S14 SQL now **fails closed before changing any schema** if those required external RPC signatures or current-workflow tables are absent. PostgreSQL's ability to compile a PL/pgSQL definition is not proof that its eventual function calls can execute; this preflight makes that limitation explicit. It still cannot cover dynamic SQL calls, complete dependency versions, privilege-based runtime access, data-level truth, or every partial migration state.

## Hosted critical-column compatibility checkpoint (2026-11-08)

A separate **read-only `pg_catalog` query** checked **31 columns in eight existing canonical ledgers and projection tables**, and found all expected shapes present. This included:

| Existing source | Evidence checked |
| --- | --- |
| `public.studio2_edition_runtime` | UUID edition identity, text state, JSONB subsystems, bigint version, non-null timezone-aware update timestamp |
| `public.studio2_organizer_tasks` | UUID task ID, **nullable** UUID edition scope, non-null state/task type/source key |
| `public.admin_notifications` | UUID recipient, **nullable** source key and resolved timestamp, non-null action flag and resolution mode |
| `public.notification_deliveries` | Text subject/category/status, non-null timezone-aware schedule |
| `private.v3_result_versions` | UUID show, bigint immutable version, JSONB result rows |
| `public.studio2_operation_receipts` | UUID operation and correlation identity, text idempotency key |
| `private.v3_domain_events` | Text event type, bigint aggregate version, JSONB payload |
| `private.v3_domain_event_outbox` | UUID event, text consumer key/status |

The staged recovery's **transaction-start preflight now validates all 31 existing columns by exact PostgreSQL type and nullability**. A missing column, changed type or weakened/strengthened nullability blocks the install before any Archive DDL. The isolated regression deliberately drops `NOT NULL` from the runtime `updated_at` column, proves the recovery refuses to install or leave a private gate table, restores the column constraint, and then completes the normal S13 → S14 parity and behavioral test.

This advances from *object-name-only* detection to a **production-observed schema subset contract**, but it does NOT reproduce a hosted-head-equivalent database, full indexes/checks/foreign keys, RLS/policies, dynamic SQL effects, Supabase migration history, or live row distributions. No production rows were selected.

## Forward-only candidate SQL

The original 11-stage candidate **omitted** the `20261019112500` canonical Task notification projection, leaving its corrected `private.studio2_sync_task_notifications(uuid)` and `private.v3_project_resolved_task_delivery_state()` trigger uninstalled on a genuine pre-S14 hosted baseline. The clean-chain test had previously retained those effects during its simulated S14 gap. The twelfth stage now preserves the exact historical effect body (except its old registration) and the local gap replays the authentic earlier Oct 03 synchronizer before applying the candidate. A passing local replay still cannot prove compatibility with the unreconstructed 159 hosted relations or every real runtime dependency.


`docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql` stages the combined effects of **twelve existing immutable historical Archive source files**, in dependency order:

| Source migration | Effect |
| --- | --- |
| `20261019112100` | Governed Archive transition, initial result readiness, domain event and task/notification reconciliation |
| `20261019112200` | **Final Results readiness hardening:** publicly released Results layer and exact immutable result version required |
| `20261019112300` | Deterministic HTTP409 conflicts and canonical transition event identity |
| `20261019112400` | Canonical Archive Task vocabulary, blocker resolution and non-resurrection guard |
| `20261019112500` | **Resolved Task notification invariant:** replace the generic synchronizer and install immediate post-resolution Inbox/delivery trigger |
| `20261019202636` | Pending/processing notification-delivery suppression after Task resolution |
| `20261020130000` | Irreversible runtime, legacy compatibility and workflow freeze |
| `20261020140000` | Dedicated runtime UPDATE guard; superseded by the later one-shot transition guard |
| `20261021110000` | Private one-shot, transaction-bound gate, Archive RPC wrapper, serialized workflow protection |
| `20261021161000` | Explicit service-role permission for canonical Task reconciliation |
| `20261021163000` | Failed-delivery evidence, Televote/eligibility terminal safeguards, reconciliation gate |
| `20261021202000` | Final repeatable Archive Task/Inbox/delivery convergence |

The historical source SQL bodies remain intact and appear in the same order, except that each *old* migration-contract INSERT is omitted and replaced by a single newly named `v3.s14.archive-forward-effect-recovery` declaration. This records **one future forward effect**, not twelve historical applications. **It does not edit `supabase_migrations.schema_migrations`.**

The first locally simulated replay detected an exact catalog mismatch in `private.v3_edition_final_results_ready(uuid)`, because an intermediate final-results hardening migration had been omitted. That stage is now explicitly included. Three other intervening Archive stages were also added to preserve the full source order. Each local rehearsal must still pass before this candidate can be considered validated.

The entire candidate is bounded in one transaction with a short lock timeout and fails closed if S13 is missing, any required relation or upstream function is missing, any new Archive target already exists, any owned Archive trigger name collides, or any of the twelve historical Archive semantic keys is already registered. Postconditions require the two gate tables, both transition entry points, the guards and enabled runtime trigger, protect private gate access, and refuse fictional historical keys.

### Why this is not production-ready

A single approximately 110-kB transaction is a **staging vehicle for local effects verification**, not an approved rollout. Production may require breaking the DDL into separately reviewed, forward-only batches with bounded locks; source migrations may include row-level projection behavior and cross-domain side effects. There is no verified production-head-equivalent clean baseline yet. **Do not paste or run this file in Supabase SQL Editor.**

More importantly, S13 is still absent on live production, and the existing S4/S5/S6/Results/Televote dependency effects have separate unresolved history gaps. Even if this combined candidate passes all local tests, applying it before S13 plus full effect reconciliation would be unsafe.

## Integrated S13 → S14 recovery seam (isolated local only)

This draft also contains an **exact Git-blob copy** of the earlier S13 candidate from draft [#2393](https://github.com/solarissongcontest/solarisstudio/pull/2393), staged at `docs/v3/recovery-candidates/forward-only-s13-foundation.sql`. The source-integrity test pins the donor blob SHA `f49b8212e2983dd0cde46d80dd6b5661e49df6a5`. It is **not** a tracked Supabase migration.

With `SOLARIS_INCLUDE_S13_FORWARD_RECOVERY=YES`, the local rehearsal:

1. Starts from a complete source-migrated, disposable Supabase instance, records S13/S14 catalog fingerprints, and proves a second S14 install is rejected.
2. Removes **only explicitly listed Archive effects** in the local fixture (never `CASCADE`). Then also removes the seven S13 RPCs and five S13 tables, in dependency order and still only inside local PostgreSQL.
3. Verifies that trying to install S14 before S13 is rejected by the explicit S13 governance preflight.
4. Applies the reviewed S13 forward-effect candidate, checks **full S13 catalog parity** for RPC definitions, privileges, columns, defaults, table ownership, constraints, and indexes.
5. Applies the eleven-stage S14 forward-effect candidate, checks **exact S14 catalog parity**, and runs the real canonical Archive behavioral integration scripts after recovery.

This closes a missing **dependency-order verification gap**, not the production-history gap. Dropping the S13 registry in this synthetic experiment necessarily removes historical *semantic registry rows* from other migrations in that disposable database. No equivalent row loss or history manipulation is permissible in production. The live S13 registry is **absent**, and its installation and any subsequent semantic contract reconciliation must be separately designed, audited and authorized.

The combined test intentionally does **not** perform or permit live Supabase migration-history updates, production SQL, or any business-data backfill.

## S06 ordered-recovery regression extension (10 November 2026)

After S03 (#2393) and S05 (#2400) were merged, the S06 branch was synchronized with current main via an **additive two-parent commit**. The S13 forward candidate has exactly the same Git blob (`f49b8212e2983dd0cde46d80dd6b5661e49df6a5`) as the merged S03 source; it is reused, not rewritten. No schema/runtime authority or original historical migrations change in this source-only PR.

In addition to the original S13-first/Archive-first negative tests, this local-only runner now:

1. Temporarily renames a required upstream Task eligibility RPC in disposable PostgreSQL, verifies the Archive preflight reports its exact missing signature, asserts no new Archive function/gate was installed, restores the RPC, and checks catalog stability.
2. Injects a test-only PostgreSQL exception **after the first real Archive function DDL** into a temporary copy of the SQL (the canonical candidate is not modified), proves the single transaction rolls back, checks the Archive and upstream catalog is unchanged, then reruns the original SQL successfully on **the same local DB**.
3. Rejects a duplicate application without changing the recovered Archive catalog. The CI workflow additionally resets a **second, independent disposable local database** through `supabase db reset --local --no-seed` and repeats the S13→S14 restoration and canonical Archive behavioral rehearsal.

The companion exact-SHA CI job now reuses the merged S02 hosted-observed **56-relation PostgreSQL 17.11 fixture** (47 Archive-scope tables and nine observed dependency parents), instead of using only a fresh source reset. It rechecks the host-catalog comparisons, parent constraints, 672 table CRUD privilege bits and 24 schema grants, then rejects S14 with absent S13 **before mutation**, applies S13 then S14 in dependency order, proves duplicate refusal without catalog changes, and denies direct gate INSERT to anon/authenticated/service_role. The container is `--network none` with no published ports and a pinned image ID; CI never connects to hosted Supabase. This job builds on the merged S02 evidence from PR [#2423](https://github.com/solarissongcontest/solarisstudio/pull/2423), not a newly invented fixture.

Full source-state migration reset and the staged candidate are **not** a sanitized hosted-head-equivalent upgrade. Real hosted table/column/ACL/history/data parity is still unproven, and only the 31 specifically audited critical column contracts are checked at preflight. S06 therefore cannot be certified DONE for the stated hosted-equivalent acceptance criterion from these synthetic rehearsals alone. Neither a green local CI run nor merging these inert recovery-candidate files authorizes hosted migrations, SQL Editor usage, real Archive transitions or the full S14 contest release.


## S06 follow-up: upstream RPC fingerprint parity (10 November 2026, source-only)

A **new bounded, operator-initiated, read-only `pg_catalog` query** against the configured Solaris Studio Supabase project confirmed PostgreSQL 17.11, 215 relations (27 `auth`, 149 `public`, 13 `private`, 26 `televoting`) and 727 functions in those four schemas. The S13 registry/strict registration RPC and Archive transition/gate remained absent. The query selected **no application rows, tokens, vote records, users or secrets**; hosted traffic is never generated by the CI check.

The same read-only catalog inspection captured only **hashed** `pg_get_functiondef` values and metadata for the **21 exact upstream RPC signatures** named in the S14 recovery preflight. All 21 were present, postgres-owned; 18 used `SECURITY DEFINER`. Their definition hashes, owner, explicit function ACL, security-definer and STRICT flags, volatility, parallel flag and function-level settings are in `evidence/s06-hosted-upstream-rpc-fingerprints-20261110.json`. This is a fixed-time observation, not a permanent claim about production state.

The first new exact-head CI attempt **correctly failed** because the older S02 fixture preserved table ACLs but had not recreated the live function-level `EXECUTE` grants: the first tested upstream RPC had local `proacl = NULL` (implicit default PUBLIC EXECUTE) versus hosted `{postgres=X/postgres}` (only owner EXECUTE). No production ACLs were changed. The S06-only `evidence/s06-hosted-upstream-rpc-acls-local.sql` explicitly revokes broad/default grants and reproduces the read-only observed grantees on **just those 21 functions in the disposable PostgreSQL fixture** before rechecking exact parity. The original S02 evidence remains unmodified. This real mismatch would not have been detected by merely checking function existence or table privileges.

The S06 networkless PostgreSQL 17.11 CI fixture now probes these same catalog fields and **fails closed** if a definition, privilege, ownership, search path or security flag differs from the observed hosted snapshot; it also verifies the 21 names match the actual S14 preflight and exercises synthetic missing/duplicate/unknown-RPC and individual-field drift negatives. It runs only *after* constructing the previously merged S02 56-relation fixture and its ACL checks. Its proof artifact is `s06-upstream-rpc-proof.json`. No hosted endpoint or database credentials enter CI.

This reduces one specific missing *upstream definition/security metadata* uncertainty. **It still does not certify the remaining 159 hosted tables, untracked function closure across 727 functions, real data, effective inherited-role privileges, all RLS/policies, cross-domain forward effects or full migration-history parity.** The staged recovery remains **not deployable**. Passing the new test does not authorize production migration, an Archive transition or release.

## S06 hosted-observed fixture interruption and same-database restart (10 November 2026)

The networkless PostgreSQL 17.11 job previously verified the bounded hosted-observed **56-of-215 relation** catalog, nine dependent parent relations, table/schema grants, the **21 exact upstream RPC definition/security fingerprints**, missing-S13 guard and duplicate refusal, but did not independently fail the *hosted-observed fixture* after real Archive DDL. The separate full-source local Supabase job already had its own post-DDL failure injection.

The networkless job now installs S13, hashes a full **schema-only `pg_dump`** (including function/trigger definitions and grants) and records the semantic-contract row count. The dump uses PostgreSQL 17.11's explicitly test-oriented fixed `--restrict-key=S06LocalOnlyStable` on the **trusted, networkless synthetic fixture only**; otherwise random `\\restrict` markers make identical PG17 dump outputs hash differently. This key is never used for untrusted/production dumps or SQL restoration. It writes **only a temporary copy** of the unchanged S14 forward candidate and inserts a deliberately raised exception **after the first Archive runtime trigger DDL**, before the next Archive function. The interrupted `psql` session must fail with that exact exception; after the connection ends and PostgreSQL rolls the transaction back, the schema dump hash and semantic-contract count must be unchanged, and the new Archive trigger function/private gate must remain absent. Only then does the CI job apply the **original** S14 candidate on the **same disposable database**, without resetting S13, and verify duplicate rejection and private gate INSERT denial.

This is an additional deterministic crash/retry **regression on the production-observed subset**, not a test against production, a multi-transaction outage guarantee or a sanitized full hosted-head-equivalent upgrade. `pg_dump --schema-only` does not establish row/data semantics; the matching hash is a same-process *before/after rollback* comparison, not a comparison with an unavailable full hosted dump. The other **159 hosted relations**, complete runtime closure of **727 functions**, representative data, external dependencies, production migration frontier and independent deployment certification remain open. Automated CI keeps `docker --network none`, no published database ports and no hosted credentials.

## Local rehearsal and actual tests

`.github/workflows/v3-s14-archive-forward-effects-local.yml` starts disposable **local Supabase**, resets the **full source migration chain**, and runs `scripts/rehearse-v3-s14-archive-forward-effects-local.sh`. That script:

1. Rejects running the candidate against a fully installed Archive schema.
2. Saves a catalog fingerprint covering canonical Archive-related functions, owners, ACLs, runtime/workflow triggers, and private gate tables.
3. **In local PostgreSQL only**, explicitly drops those Archive effects without `CASCADE`; it does not touch existing contest rows or Supabase migration-history versions. Unexpected dependencies fail closed.
4. Applies the staged forward-effect candidate once.
5. Requires exact catalog parity with the original clean-source installation; checks new semantic recovery record and absence of forged historical semantic records.
6. Requires duplicate application to fail without changing the resulting catalog.
7. Runs the existing full S14 local Archive integration tests: final Results prerequisite, governed transition and receipts, S4 outbox consequences, invalid/unauthorized transitions, one-shot gate and irreversibility, archived Task/Inbox/delivery non-resurrection, retained failed attempts and separate-edition task isolation.

`scripts/v3-s14-archive-forward-effects.contract.test.mjs` independently compares the candidate SQL to the original seven source effects, tests ordering and fail-closed markers, and guards against accidental history mutation.

**Critical limitation:** this is a **simulated local Archive gap** on a fully migrated source schema. It is NOT a faithful clone of production's incomplete migration history or existing data, and cannot certify a hosted upgrade. Clean local proofs do not substitute for an isolated sanitized hosted-head-equivalent upgrade, semantic-effect ledger closure, representative synthetic data, permissions/RLS review, staging rehearsal, release verification, rollback plan or separate explicit owner approval.

**NO-GO remains in force for all hosted DDL, migration history repairs, flags, merges intended to release these effects, and real Archive transitions.**


## S06 integrated 63-table isolated rehearsal (10 November 2026)

The previously merged [#2430](https://github.com/solarissongcontest/solarisstudio/pull/2430) independently proved seven additional hosted-observed tables by their full 17-field `pg_catalog` fingerprints against the frozen 215-relation metadata manifest, using a private no-network PG17.11 fixture. The current S06 integration extends the **existing networkless S14 Archive-scope job** by applying those same seven observed table definitions *after* the S02 54-table and 2-table fixtures, all within **one disposable PG17.11 database**. It then:

- Fails if the combined database does not contain exactly **63 distinct physical table identities**.
- Re-extracts the full local catalog in that same database; compares all seven new table digests against the existing independently frozen hosted manifest, including permissions, constraints, indexes and RLS, before starting S13→S14 migration recovery.
- Preserves the earlier 56-table scoped Archive and nine-parent checks, 21 hosted-observed RPC fingerprint checks, grants, behavior, rollback and interrupted same-database restart proof.
- Explicitly requires the **full 215-relation and 727-routine hosted-equivalence verifier to REJECT** this incomplete 63-table database. A success exit from the comparison would make the job fail.

**Limitations:** The seven-table check and the older 56-table Archive checks have **different verification scopes**. This job does not assert full catalog digest equality for all 63 tables, nor any full hosted-head-equivalence, default-role membership, independent authentication, data parity or production migration authority. The remaining 152 unmodeled table identities and the broader function/role/security/migration-history compatibility gaps remain NO-GO for S06 release. GitHub Actions must never connect to hosted Supabase. Production was not modified.

## S06 68-table integrated extension (10 November 2026)

Building on the [previous 63-table integrated rehearsal](https://github.com/solarissongcontest/solarisstudio/pull/2431) and the separately verified [five FK-bound version ledgers](https://github.com/solarissongcontest/solarisstudio/pull/2432), this **isolated PG17.11 job** installs all 68 observed hosted physical relation identities in the **same** disposable database:

- Original **56** S02/S14 Archive-scope tables, with the original exact 56-table catalog, nine-parent catalog, 56-table ACL and 21 upstream RPC scope checks retained.
- **Seven** independent hosted-observed no-FK tables, with all frozen relation catalog fingerprints checked before S13→S14 recovery.
- **Five** newly observed version-ledger tables using real foreign keys to the existing 56 parents, with all frozen relation catalog fingerprints checked separately.
- The comparison refuses any unexpected/duplicate/missing relation identity and insists on exactly **68** real physical relations.
- After the missing-S13 refusal, S13 prereq, injected S14 DDL rollback, same-DB restart, idempotency refusal and negative permission tests, the full 12-table digest projection must be byte-for-byte identical to its pre-recovery catalog.
- The all-hosted **215-relation / 727-routine** manifest comparison MUST fail closed. A full equivalence success from a 68-table fixture is itself a test failure.

**Release boundary:** This proves 56 scoped fixture identities coexisting with 12 new **full-field metadata-parity** identities. It does not establish complete 68-table full-digest parity, 727 routine definition/runtime closure, production auth role memberships, default privileges, extensions, real row-dependent behavior, migration-history closure, S06 certification, S07 authorization or production rollout safety. CI never receives production credentials or connects to hosted Supabase. This is not a migration or deployment.

## S06 76-table integrated fixture (10 November 2026)

Following merge of [#2433](https://github.com/solarissongcontest/solarisstudio/pull/2433), 68 hosted-observed table names already coexist in one **networkless disposable PostgreSQL 17.11** S13→S14 Archive recovery fixture. The next source-only local extension adds **eight** additional hosted-observed tables with no RLS policies and no ordinary triggers:

- `private.v3_confirmation_account_drafts` and `private.v3_televote_recovery_handles`
- `public.studio2_voting_declaration_policy`, `public.studio2_eligibility_override_versions`
- `public.ssc_rulebook_releases` and its child `public.ssc_rulebook_events`
- `public.studio2_next_in_line_submission_revisions`
- `public.studio2_platform_operational_state`

All their real FK parents already occur in the preceding 68 hosted-observed fixture, except `ssc_rulebook_events` which references `ssc_rulebook_releases` created earlier in this same additional fixture. The SQL creates **no application rows**. It reproduces read-only catalog-observed columns/defaults, FK and CHECK constraints, indexes including partial unique indexes, RLS state and table ACLs. The new `scripts/verify-v3-s06-eight-relation-parity.mjs` compares all 17 per-table frozen hosted catalog fields, refuses an incorrect PG17.11 baseline, changed hosted table shape, extra or duplicated identities, and drift in any column/constraint/index/ACL/RLS/trigger fields.

The updated networkless S14 job requires **exactly 76 distinct local physical table names (56 scoped S02 + 7 + 5 + 8)**, runs the original 56-table and 21 RPC scope verifiers unchanged, checks the last **20** tables' complete 17-field fingerprints separately, and asserts those 20 are unchanged after missing-S13 refusal, interrupted S14 rollback, same-DB restart and duplicate-install denial. The **215 relations / 727 routines** global hosted-equivalence verifier MUST continue to reject 76 as incomplete. CI has no Supabase credentials, remote DB aliases, ports or external network connectivity.

**Explicit NO-GO:** This validates coexistence and selected metadata parity, not complete 76-table full-field parity or 727 routine definitions and runtime semantics, production auth/roles/extensions, real data behavior, migration-history reconciliation, deployment approval or S07. **139 unmodeled table names remain** outside the new 76-table fixture. No production database or migration was modified. A separate source and security review plus exact-head CI is required before merging this source-only addition.
