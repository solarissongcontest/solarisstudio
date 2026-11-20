# V3 production migration divergence: live catalog evidence and forward-only recovery plan

**Status:** NO-GO for production migration, rollout expansion, or migration-history repair.
**Evidence date:** 2026-11-07. **GitHub reference commit:** `c43a580e9b71dd0bbc0f42668870e90e71bb6bf7` (main when inspected).
**Scope:** READ-ONLY Supabase catalog/history inspection and repository SQL review. No hosted data writes, migration execution, branch deployment, production CI, or feature-flag edits.

This is a companion to [production-frontier-preflight.md](./production-frontier-preflight.md), not a replacement for its immutable cutover or operator procedure. **The evidence in this note is a snapshot; it is not a schema-equivalence certificate or authorization to deploy.**

## 1. Source and observed baseline

- Official project: `dkxmnvekiopyesuzggeu` (the existing Solaris Studio production project). Other connected Supabase projects must not be mistaken for this project.
- Source migration files: **494**; hosted migration-history entries: **497**; hosted tip: `20261101181812`; source tip: `20261105140500`.
- Immutable bootstrap history boundary: `20261014020000`.
- **36** repository SQL versions after the boundary at/before hosted tip lack matching hosted *history* entries; **32** newer repository migrations remain pending; **0** hosted-only post-cutover versions, **0** post-cutover version/name mismatches, **0** duplicate version IDs.
- These 68 files are **not** an approved runnable migration batch. The older bootstrap migration identities are intentionally not one-to-one with source and must never be handled by extending the cutoff.
- Live catalog verification confirms that some SQL effects of those 36 *really are missing*. It also confirms that at least one narrow effect exists even without the matching history row. Historical omission and object absence must therefore be tracked independently.

### Direct live catalog facts (metadata only, not contest rows)

| Tested assertion | Observed |
| --- | --- |
| `private.v3_migration_contracts`, `private.v3_backfill_jobs`, `private.v3_schema_compatibility` | Absent |
| `public.v3_register_migration_contract(text,integer,text,boolean,text,text)` | Absent |
| `public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)` | Absent |
| `private.v3_archive_runtime_transition_gates` and `v3_guard_archive_runtime%` triggers | Absent; zero matching guard triggers |
| `private.v3_televote_result_projection_sources`, `public.studio2_televote_projection_status` | Absent |
| `public.v3_public_published_result_snapshot` | Absent |
| `public.studio2_reconcile_notification_delivery_projection` | Absent |
| `public.studio2_apply_confirmation_entry_review` | Present, definition still contains `'40001'`; no `'PT409'` |
| Deterministic-conflict migration's 28 specified existing function signatures | All 28 present; all still contain `'40001'`; none contains `'PT409'` (definition text check, not behavioral test) |
| `public.emit_entry_published_event(uuid,uuid)` `service_role` execute privilege | **Present**; `anon` and `authenticated` execute privileges absent |
| `service_role` SELECT on inspected Confirmation-sync tables | Present for `public.submissions`, `public.internal_entries`, `public.national_final_entries`; full grant matrix still unverified |
| `public.admin_set_show_running_order(uuid,uuid[])` | Existing older implementation clears positions and updates participant rows in a loop |
| `participants_sync_running_order_results` trigger | Absent |
| `solaris-app-push-dispatch`, `solaris-studio2-publish-due-shows` | Scheduled and active |
| `solaris-publish-due-entries`, `solaris-studio2-publish-due-notices` | Not registered in `cron.job`; existence of alternative schedulers unverified |

The live rollout table additionally showed `solaris_app_v3`, `solaris_app_v3_confirmation`, and `solaris_app_v3_results` **enabled**, with empty user- and edition-target arrays; `solaris_app_v3_entry`, `solaris_app_v3_jury` and `solaris_app_v3_organizer` **disabled**. The `solaris_app_v3_live` row was absent. The live `private.studio2_feature_enabled_for` definition interprets empty target arrays as no additional targeting restrictions, but this does not replace auth/RLS or establish that every new RPC is invoked by the shipped frontend.

## 2. Effect triage for ALL 36 historical post-cutover holes

**Status vocabulary:**
- **Missing core**: a major object, guard, overload, or behavior specifically introduced by that file was directly shown absent. Does *not* mean every statement in the file is absent.
- **Partial**: pre-existing infrastructure exists, but a specific intended new effect is absent or not fully validated.
- **Narrow effect present**: at least one specifically checked permission/effect exists; the entire migration is **not** certified.
- **Needs full catalog comparison**: only source contents and/or shared downstream absence known; precise effect not yet individually checked.

**This matrix is for planning; do not translate the rows into a runnable replay sequence.** SQL timestamps interleave across groups.

| Historical SQL file (suffix after timestamp) | Status | Evidence / required follow-up |
| --- | --- | --- |
| `20261017001000_v3_s14_televote_result_truth.sql` | **Missing core** | Projection-source table, materialization/status RPC and associated source-management triggers absent. Compare pre-existing `televote_votes` and publication triggers before forward repair. |
| `20261017001010_v3_s14_televote_projection_guard_hardening.sql` | **Missing core** | Its `private.v3_guard_source_managed_televote_projection` function absent; reestablish source-only writes without a privileged-role shortcut. |
| `20261017001020_v3_s14_televote_projection_replay_hardening.sql` | **Missing core** | `private.v3_televote_projection_snapshot` absent; existing `sync_results_after_vote_change` must be semantically compared, not blindly overwritten. |
| `20261017123000_v3_s5_acknowledgement_consequences.sql` | **Partial** | Legacy acknowledgement RPC exists; new acknowledgement-event emission trigger/function absent. Preserve existing acknowledgement receipts. |
| `20261018024500_v3_entry_review_conflict_http409.sql` | **Partial** | Entry-review RPC exists but retains `40001` rather than expected explicit conflict handling. |
| `20261018031000_v3_http409_deterministic_conflicts.sql` | **Missing intended behavior** | All 28 allowlisted signatures have unnormalized `40001`; preserve genuine serialization errors outside allowlist. |
| `20261018053000_v3_s6_confirmation_requirement_reconciliation.sql` | **Missing core** | `public.studio2_verify_confirmation_requirements` absent. The canonical requirement table itself exists. |
| `20261018081500_v3_s5_entry_lifecycle_consequences.sql` | **Partial** | Existing event processor exists; new entry submission/version trigger emitters absent. Verify no duplicate event writer. |
| `20261018111500_v3_confirmation_sync_service_role_privileges.sql` | **Narrow effect present** | Inspected three service-role SELECT grants exist; independently verify every exact grant from source and exact privileges before any replacement. |
| `20261018122500_v3_voting_declaration_expected_edition_scope.sql` | **Partial** | Legacy preview/apply RPCs exist; exact new expected-edition overloads need signature/ACL parity verification. |
| `20261019000500_v3_confirmation_sync_publication_event_service_role.sql` | **Narrow effect present** | `service_role` can already execute `emit_entry_published_event(uuid,uuid)`; browser roles cannot. Do not duplicate a grant merely to fix history. |
| `20261019013000_v3_public_live_rollout_flag.sql` | **Missing core** | `solaris_app_v3_live` key absent, and persisted flag constraint lacks it. DO NOT enable Live automatically. |
| `20261019110000_v3_s9_safe_metrics.sql` | **Missing core** | S9 snapshot RPC and the three named time-leading indexes absent. Existing durable ledgers are present. |
| `20261019111000_v3_s13_migration_hardening.sql` | **Missing core** | S13 registry, compatibility, backfill, parity tables and registration/control RPCs absent. Foundational blocker for later strict registrations. |
| `20261019112000_v3_s10_sli_snapshot.sql` | **Missing core** | `public.admin_system_v3_sli_snapshot` absent; depends on S9 privacy-safe metric snapshot. |
| `20261019112100_v3_s14_archive_consequence_reconciliation.sql` | **Missing core** | V3 transition RPC, archive readiness/guard functions and archive transition trigger absent; old runtime and task tables exist. |
| `20261019112200_v3_s14_final_results_readiness_hardening.sql` | **Missing core** | Target `private.v3_edition_final_results_ready` absent; latest public version parity required before results-to-archive. |
| `20261019112300_v3_s14_transition_http409.sql` | **Missing prerequisite** | Target V3 transition RPC is absent; conflict mapping must be validated only after correct versioned RPC exists. |
| `20261019112400_v3_s14_archive_task_registry_alignment.sql` | **Missing core** | Archive task type/terminal-resurrection helpers and guard trigger absent. |
| `20261019112500_v3_s14_resolved_task_notification_invariant.sql` | **Missing core** | Resolved-task delivery projection trigger absent; verify historic failed/pending delivery distinctions. |
| `20261019112900_v3_s13_migration_registration_context.sql` | **Missing prerequisite** | S13 registration RPC absent; migration-owner context must be restored without opening browser execution. |
| `20261019113000_v3_s6_notification_reconciliation.sql` | **Missing core** | Candidate/verify/reconcile notification RPCs absent. Verify service-only repair and read-only verifier separately. |
| `20261019113100_v3_s6_notification_reactivation.sql` | **Missing core** | Reconciliation entry point absent; reactivation must never rewrite sent or failed historical outcomes. |
| `20261019113200_v3_s6_notification_failure_visibility.sql` | **Missing core** | Verification RPC absent; failure must be reported as drift, not healthy convergence. |
| `20261019113300_v3_s13_strict_registration_restore.sql` | **Missing prerequisite** | S13 registry absent; restore strict key validation only *after* the bounded notification registration window. |
| `20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql` | **Missing core** | `private.v3_reconcile_resolved_task_notifications` absent. |
| `20261020130000_v3_s14_archive_invariant_forward_fixes.sql` | **Missing core** | Archive runtime insert/delete and archived workflow guard triggers absent. |
| `20261020140000_v3_s14_archive_runtime_update_guard.sql` | **Missing core** | Archive runtime UPDATE guard trigger absent. |
| `20261021110000_v3_s14_archive_guard_authority_forward_fix.sql` | **Missing core** | Unforgeable one-shot transition gate table/function absent; must never use forgeable session GUC as authority. |
| `20261021161000_v3_s14_task_reconciliation_service_boundary.sql` | **Needs full catalog comparison** | Aggregate private task reconciler exists; exact `service_role` EXECUTE privilege was not fully audited. |
| `20261021163000_v3_s14_failed_task_delivery_evidence.sql` | **Missing core** | Archive task reconciliation gate table absent; compare prune/rebuild code and preserve failed delivery evidence. |
| `20261021202000_v3_s14_archive_reconciliation_convergence.sql` | **Needs full catalog comparison** | Aggregate task reconciler exists; compare exact Archive resolver and notification convergence semantics. |
| `20261022151607_batch_running_order_result_sync.sql` | **Missing intended behavior** | Older multi-statement running-order RPC persists; statement-level sync trigger absent. |
| `20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql` | **Missing prerequisite** | S13 contract registry absent; semantic adoption must follow an actually compatible running-order implementation. |
| `20261024170500_v3_public_published_result_snapshot.sql` | **Missing core** | Immutable-publication-bound snapshot RPC absent; do not allow mutable/unpublished Results fallback. |
| `20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql` | **Missing core** | Scoped Confirmation requirement reconciliation RPC absent; canonical requirements table must not be overwritten directly. |

### Material caveat: known base tables/functions do NOT prove new V3 behavior

Live production already contains `public.studio2_edition_runtime`, `public.studio2_confirmation_requirements`, `private.v3_domain_events`, `private.v3_domain_event_outbox`, `private.v3_result_versions` and multiple existing RPCs. A same-named existing function may have **older body semantics**, grants or concurrency behavior. Each recovered effect needs function-signature + body-meaning + grant + trigger + policy + data-compatibility proof. Do not infer total absence or total equivalence from name checks.

## 3. All 32 newer repository migrations: dependency lanes (not an execution order)

### A. World foundations, authority, privacy and legislative tally (14)

- `20261102170500_v3_tg1_world_country_control_foundation.sql`
- `20261102171500_v3_tg2_world_institution_core.sql`
- `20261102171600_v3_tg2_world_institution_access.sql`
- `20261102171700_v3_tg2_world_office_term_canonical_alignment.sql`
- `20261102171800_v3_tg2_world_office_term_dependents.sql`
- `20261102171950_v3_tg1_current_controller_identity_guard.sql`
- `20261104115831_v3_tg2_world_identity_linkage_privacy.sql`
- `20261104120600_v3_tg1_controller_login_privacy.sql`
- `20261104120800_v3_tg2_nonpublic_organ_office_privacy.sql`
- `20261104120900_v3_tg2_cross_organization_organ_integrity.sql`
- `20261104121000_v3_tg3_world_public_rollout_flag.sql`
- `20261104121500_v3_tg2_office_term_effective_authority.sql`
- `20261104121600_v3_tg2_membership_effective_representation.sql`
- `20261104165500_v3_tg8_exact_rational_legislative_tally.sql`

Live catalog: `public.world_country_control_terms` and `public.world_organizations` absent. Inspect exact seed, identity/RLS, dual-authority and dependent-table ordering. Retain World feature rollout off until separately certified.

### B. Televote, canonical Results, publication and score/reconciliation (14)

- `20261103004500_v3_s14_atomic_televote_calculation.sql`
- `20261103004600_v3_canonical_result_recalculation.sql`
- `20261103004700_v3_result_reconciliation_hardening.sql`
- `20261103004800_v3_s14_televoting_round_bindings_runtime_access.sql`
- `20261103004900_v3_result_countback_parity.sql`
- `20261103090202_v3_results_jury_review_invalidation.sql`
- `20261103194500_v3_s14_televote_sync_service_role_acl.sql`
- `20261103210000_v3_s14_televote_sync_audit_rpc.sql`
- `20261103220000_v3_s14_atomic_televote_recovery.sql`
- `20261103220001_v3_qualification_null_rank_reset.sql`
- `20261104132500_v3_s14_results_reconciliation_authority.sql`
- `20261104135245_v3_results_active_snapshot_and_qualification.sql`
- `20261104185330_v3_publication_control_initialization_retry.sql`
- `20261105140500_v3_televote_influence_role_runtime_access.sql`

Several of these SQL files **unconditionally call the absent S13 `v3_register_migration_contract` function**. Therefore they cannot be a stand-alone first production batch. Their canonical result/reveal/qualifier authority and exact results-version bindings must be rehearsed after historical source truth, API grant and S13 reconciliation.

### C. Cross-cutting runtime, Search, National Final and edition metadata (4)

- `20261102205000_v3_service_role_claim_compatibility.sql`
- `20261104110000_v3_reference_literal_search.sql`
- `20261105045922_v3_pending_nf_winner_worker_authority.sql`
- `20261105115452_v3_edition_metadata_command.sql`

The already-recorded National Final winner SQL from 2026-11-01 is **not** part of these 32 and must not be replayed. Verify service-role claim, RPC authority and schema prerequisites explicitly.

## 4. Dependency-correct remediation design

This is a **design**, not an implementation, execution approval or complete ordering proof.

1. **Freeze source + history evidence.** Fix an exact commit SHA, host migration list, 36/32 inventories and read-only system-catalog metadata; keep source and actual history as different evidence channels. Stop deployment if either head changes.
2. **Obtain a sanitized hosted-head-equivalent local baseline.** A clean 494-file replay alone is insufficient. Match the live versions of affected function definitions, grants, triggers, policies, constraints, schemas and relevant *shapes* of old data, without moving production rows or credentials into CI.
3. **Build an effect-level ledger for the 36 holes.** For each function and trigger capture source definition, active live definition, semantic delta, ACL and caller model, RLS, affected data shapes, expected source-of-truth writer, consumer requirements, lock cost, idempotency, upgrade/retry and recovery. Explicitly distinguish effects already present from effects absent.
4. **Resolve prerequisites on the local equivalent first.** S13 contract + migration-owner context must precede registrations that require them. Restore S9 before S10. Reconcile Televote source projection before its guards/replay and later Results calculations; preserve version-bound publication and never invent unpublished results. Archive must introduce the canonical transition and terminal-state guards together with unforgeable one-shot authority, task finality and failed-delivery history.
5. **Repair only proved-missing SQL effects with NEW reviewed forward-only migrations.** Never edit immutable old SQL, impersonate a historical migration with a no-op entry, or blindly re-run historical SQL. For narrow already-present grants, record proof instead of redundant mutations.
6. **Audit and restore deterministic HTTP conflict transport.** Normalize only the reviewed deterministic allowlist, preserve legitimate `40001` concurrency/worker retry semantics, test the actual PostgREST response and stale-command idempotency locally.
7. **Verify scheduling independently.** Compare `cron.job` with Cloudflare/other explicitly configured schedulers; do not register duplicate due-entry/notice jobs until exact owner, role, timing, missed-job catch-up and idempotency are proven.
8. **Stage pending newer migrations by dependency**, not all 32 at once: core integrity and launch-critical contracts first, then independently gated World/other feature migrations. All RLS/`SECURITY DEFINER` boundaries and grants need negative authorization tests.
9. **Rehearse both lineages separately:** full clean-source replay and the exact forward-only upgrade from hosted-head-equivalent local state. Test data integrity, V3 Results/Publication/Archive, scoped recoveries, old-client compatibility, zero duplicate jobs/events, grants/RLS and upgrade retries. Prove no double result writes, no bypass of terminal Archive, no leaked jury/vote/private actor data.
10. **Close migration history only on evidence.** The GitHub comparator must show zero unexplained post-cutover holes and zero mismatches. Any formal history adoption is a separate explicit operator-reviewed step **after** equivalent effects are proven, never a convenience `migration repair` or `db push --include-all` to suppress red results. Keep the October 14 cutoff fixed.
11. **Only after validated local evidence**, review the fixed candidate and update `scripts/v3-production-supabase-push.sh` exact remote/source heads, pending manifest and commit pins. Pass current SHA-bound S13/S14/S15/S16 and release certifier. Obtain *separate owner approval* for hosted production SQL or rollout. Until then **NO-GO**.

### Deployment-script note

At this snapshot `scripts/v3-production-supabase-push.sh` remains deliberately pinned to `EXPECTED_REMOTE_HEAD=20261017212902`, `EXPECTED_REPO_HEAD=20261017212902` and zero pending versions. These pins **do not match** current hosted/source heads and should remain fail-closed. Updating the expected numbers now to force a push would be an unsafe non-solution.

## 5. Acceptance criteria and explicit limitations

**To graduate from discovery to safe implementation:** every one of the 36 holes must have an object/effect parity verdict with catalog signatures, verified dependencies, current-authority ownership, least privilege, rollback mode, and an expected local probe. Dependencies for all 32 pending versions must be reconciled. A reviewed hosted-head-equivalent fixture must exist.

**To graduate from local implementation to release candidate:** local clean replay and hosted-equivalent upgrade are both green; permission-negative tests, event/receipt consistency, scheduled job uniqueness, audit/privacy, Televote projection, version-bound Results and irreversible Archive are green; history is no longer falsely represented; exact-SHA Quality/S13/S14/S15/S16 evidence is green.

**What is not yet proven:** full 36-file semantic equivalence, upgrade safety on existing historical records, presence/absence of alternate schedulers, end-user route failures, production rollout readiness, migration-history closure and any production deployment. Do not describe this note as a migration fix or a completed release.

**Ownership boundary:** This documentation branch contains *no* SQL migration, migration-history write, deployment change, production flag change or permission change. The System/migration owner must approve the eventual forward SQL and release procedure; production deployment needs separate human authorization.
