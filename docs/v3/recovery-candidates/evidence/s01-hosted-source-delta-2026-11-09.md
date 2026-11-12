# S01: hosted-versus-source effect inventory (9 November 2026)

**Status:** EVIDENCE VERIFIED, **NOT** production migration/release approval. **Scope:** S01 only. **Authority:** non-authoritative, dated operator evidence. The machine-readable [effect inventory](s01-hosted-source-delta-2026-11-09.json) contains 83 classified review rows, owners, evidence links and directions; it **does not** replace [#2417](https://github.com/solarissongcontest/solarisstudio/pull/2417), which is still stacked on [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404).

**Repository main (observation SHA):** [`1297490c9367cf7c002f68059d681a1a094f739a`](https://github.com/solarissongcontest/solarisstudio/commit/1297490c9367cf7c002f68059d681a1a094f739a); production project: `dkxmnvekiopyesuzggeu`. User explicitly approved a **bounded read-only** production metadata review; the queries were run manually using the connected Supabase inspection capability. No application rows, user identities, votes, credentials, data mutations, migrations, deployments, RLS edits or hosted automated tests.

## Live migration frontier

| Property | 9 November observed |
| --- | ---: |
| Source SQL migrations at exact main SHA | **495** |
| Hosted migration history records | **497** |
| Hosted latest version | `20261101181812` |
| Immutable bootstrap cutover | `20261014020000` |
| Post-cutover history holes (version recorded in source, not hosted history) | **36** |
| Later source migrations (version newer than hosted head) | **33** |
| Hosted-only post-cutover versions | **0** |
| Post-cutover version/name mismatches | **0** |
| Duplicate source migration versions | **0** |

The previous 7–8 November inventory had **32** pending source files. Current main added `20261108004000_v3_s14_signed_combined_projection.sql`; it is the **33rd pending source version**, not proof its SQL effects are absent. **Missing history ≠ missing effect.**

## Bounded current pg_catalog checks

- The [existing 38-identity SELECT](https://github.com/solarissongcontest/solarisstudio/blob/1f772d7f91e81adefa992f643801b81f54acebbd/docs/v3/production-schema-effect-readonly-audit.sql) was executed against system catalogs: **38 named identities checked, all absent**. This query is name-level for some functions/triggers; a name hit alone would not establish exact identity or behavior. Its two World objects are among later pending migrations and are not reclassified absent wholesale.
- The same SQL source's **28 exact deterministic-conflict signatures**: 28 exist, 28 definition texts contain `'40001'`, zero contain `'PT409'`. This is string inspection, **not an executed HTTP 409 behavioral test**.
- On eight targeted S14/Archive/Event/receipt relations: **114 columns, 69 constraints, 30 indexes, 20 non-internal triggers, four RLS policies** (current scoped counts, not whole database counts). This matches the dated [#2405 method](https://github.com/solarissongcontest/solarisstudio/blob/cf6896bc1a54f48653255333751dd438c9e318e3/docs/v3/recovery-candidates/evidence/s14-hosted-schema-local-parity-method-2026-11-08.md), **but object-level parity is still false**.
- Exact relation-attached named catalog probes reconfirmed **two hosted-present direct-write guard triggers** and **eight source-only absent named triggers/indexes**. Do **not** remove the hosted guards to force a green comparison.
- `public.notification_deliveries`: `anon` SELECT/INSERT and `authenticated` INSERT/UPDATE table privilege bits are **present**, and table **RLS is enabled**. A table-level grant is **not** proof of access to any row. Review policy semantics locally before changing grants.
- `private.studio2_reconcile_all_organizer_tasks(uuid)` still exists with definition MD5 `756db08b6994b189992bd527f97c4b37`, but `service_role` EXECUTE is **false**. S13 registration and Archive transition entry points are still absent by exact signature; the Archive task gate and notification reconciliation function are absent.
- `public.emit_entry_published_event(uuid,uuid)`: `service_role` can EXECUTE while `anon` and `authenticated` cannot. This is a clear example of a present *effect* despite a missing history record.
- The operator-only cron metadata check found push dispatch and show publishing scheduled/active, while the two named entry/notice jobs are not registered in `cron.job`. External scheduler ownership remains **unknown**.

All hosted queries were SELECT-only and scoped to `pg_catalog`/migration metadata or named feature/cron privileges. No production migration-history repairs or other mutations.

## Historical effect classifications (28 absent named effects, 8 partial, dated review)

These statuses are classifications of the **named effect checked**, not complete migration equivalence. The `Current sampled` column is **unknown** unless a relevant named catalog identity or permission was rechecked on 9 November. The complete machine-readable ledger includes links to the [7 November audit](https://github.com/solarissongcontest/solarisstudio/blob/1f772d7f91e81adefa992f643801b81f54acebbd/docs/v3/production-schema-effect-reconciliation-2026-11-07.md) and [8 November effect matrix](https://github.com/solarissongcontest/solarisstudio/blob/5961c982980d78e900c6558e5c534854ceed16c1/src/lib/v3-production-schema-effect-matrix.ts).

| Source SQL filename (without .sql) | Dated effect | Current sampled | Evidence key | Consult owner | Remediation direction (review only) |
| --- | --- | --- | --- | --- | --- |
| `20261017001000_v3_s14_televote_result_truth` | absent | absent | s14-televote-source-truth | Televote domain owner | establish source-managed projection contract before guard recovery |
| `20261017001010_v3_s14_televote_projection_guard_hardening` | absent | absent | s14-televote-guard-absent | Televote domain owner | integrate the owned S14 guard candidate after source truth |
| `20261017001020_v3_s14_televote_projection_replay_hardening` | absent | absent | s14-televote-replay-snapshot-absent | Televote domain owner | define projection snapshot and compare legacy result-sync semantics |
| `20261017123000_v3_s5_acknowledgement_consequences` | partial | unknown | acknowledgement-rpc-present | Entry/Participant domain owner | add event consequence emission without replacing acknowledgement receipts |
| `20261018024500_v3_entry_review_conflict_http409` | partial | unknown | entry-review-rpc-40001 | Entry/Participant domain owner | review bounded conflict mapping for the existing entry-review command |
| `20261018031000_v3_http409_deterministic_conflicts` | absent | absent | 28-signature-40001-scan | System/Platform owner | classify and update only the allowlisted deterministic conflict signatures |
| `20261018053000_v3_s6_confirmation_requirement_reconciliation` | absent | unknown | confirmation-requirement-rpc-absent | Confirmation domain owner | define scoped confirmation requirement verification |
| `20261018081500_v3_s5_entry_lifecycle_consequences` | partial | unknown | entry-event-processor-present | Entry/Participant domain owner | add missing entry lifecycle emitters with one canonical producer |
| `20261018111500_v3_confirmation_sync_service_role_privileges` | partial | unknown | confirmation-select-grants-partial-audit | Confirmation domain owner | complete exact grant comparison before changing privileges |
| `20261018122500_v3_voting_declaration_expected_edition_scope` | partial | unknown | legacy-voting-rpcs-present | Voting domain owner | verify expected-edition overload signatures and ACLs |
| `20261019000500_v3_confirmation_sync_publication_event_service_role` | partial | partial | publication-event-service-grant-present | Confirmation domain owner | retain existing grant and prove full source privilege parity |
| `20261019013000_v3_public_live_rollout_flag` | absent | unknown | live-rollout-key-absent | Public/Live rollout owner | prepare guarded flag support without enabling Live |
| `20261019110000_v3_s9_safe_metrics` | absent | absent | s9-rpc-and-indexes-absent | Reliability/Observability owner | integrate owned S9 candidate after S13 authority |
| `20261019111000_v3_s13_migration_hardening` | absent | absent | s13-five-tables-seven-rpcs-absent | System/Platform owner | integrate the tested S13 forward-only foundation candidate |
| `20261019112000_v3_s10_sli_snapshot` | absent | absent | s10-rpc-absent | Reliability/Observability owner | integrate owned S10 candidate after S9 and S13 |
| `20261019112100_v3_s14_archive_consequence_reconciliation` | absent | absent | archive-transition-rpc-absent | Archive/Organizer Task domain owner | define archive transition contract against hosted-equivalent lifecycle state |
| `20261019112200_v3_s14_final_results_readiness_hardening` | absent | unknown | final-results-readiness-absent | Results domain owner | bind archive readiness to immutable published Results |
| `20261019112300_v3_s14_transition_http409` | absent | absent | edition-transition-rpc-absent-catalog-20261108 | Archive/Organizer Task domain owner | compare conflict semantics after the versioned transition command exists |
| `20261019112400_v3_s14_archive_task_registry_alignment` | absent | unknown | archive-task-guards-absent | Archive/Organizer Task domain owner | add terminal archive task registry and resurrection guards |
| `20261019112500_v3_s14_resolved_task_notification_invariant` | absent | absent | resolved-task-projection-absent | Notifications domain owner | add resolved-task delivery invariant without rewriting outcomes |
| `20261019112900_v3_s13_migration_registration_context` | absent | absent | s13-registration-rpc-and-registry-absent-catalog-20261108 | Notifications domain owner | review semantic registration context after the strict S13 foundation |
| `20261019113000_v3_s6_notification_reconciliation` | absent | absent | notification-reconciliation-rpcs-absent | Notifications domain owner | define service-only notification candidate and verifier |
| `20261019113100_v3_s6_notification_reactivation` | absent | unknown | notification-reactivation-absent | Notifications domain owner | reactivate only unresolved notifications without rewriting sent or failed outcomes |
| `20261019113200_v3_s6_notification_failure_visibility` | absent | unknown | notification-verifier-absent | Notifications domain owner | expose drift as failure evidence rather than healthy convergence |
| `20261019113300_v3_s13_strict_registration_restore` | absent | absent | s13-strict-registry-and-rpc-absent-catalog-20261108 | Notifications domain owner | retain the tested strict semantic registration contract |
| `20261019202636_v3_s14_resolved_task_delivery_reconciliation` | absent | unknown | resolved-task-reconciler-absent | Notifications domain owner | add bounded resolved-task delivery reconciliation |
| `20261020130000_v3_s14_archive_invariant_forward_fixes` | absent | absent | archive-runtime-guards-absent | Archive/Organizer Task domain owner | add archive insert/delete invariants |
| `20261020140000_v3_s14_archive_runtime_update_guard` | absent | absent | archive-update-guard-absent | Archive/Organizer Task domain owner | add archive runtime update guard |
| `20261021110000_v3_s14_archive_guard_authority_forward_fix` | absent | absent | archive-one-shot-gate-absent | Archive/Organizer Task domain owner | use unforgeable one-shot transition authority |
| `20261021161000_v3_s14_task_reconciliation_service_boundary` | partial | partial | aggregate-task-reconciler-service-execute-false-catalog-20261108 | Archive/Organizer Task domain owner | complete exact service-role execution and dependency comparison |
| `20261021163000_v3_s14_failed_task_delivery_evidence` | absent | unknown | failed-delivery-gate-absent | Notifications domain owner | preserve failed delivery evidence through archive reconciliation |
| `20261021202000_v3_s14_archive_reconciliation_convergence` | partial | partial | task-reconciler-present-archive-gate-and-terminal-calls-absent-catalog-20261108 | Archive/Organizer Task domain owner | compare exact archive resolver and notification convergence semantics |
| `20261022151607_batch_running_order_result_sync` | absent | absent | running-order-sync-trigger-absent | Results domain owner | add statement-level running-order result synchronization |
| `20261023205400_v3_s13_adopt_batch_running_order_result_sync` | absent | absent | s13-registry-running-order-statement-trigger-and-batch-function-absent-catalog-20261108 | Results domain owner | adopt running-order synchronization only after compatibility proof |
| `20261024170500_v3_public_published_result_snapshot` | absent | absent | published-result-snapshot-absent | Results domain owner | add immutable publication-bound Results snapshot |
| `20261024200300_v3_s6_confirmation_requirement_bounded_repair` | absent | unknown | bounded-repair-rpc-absent | Confirmation domain owner | add scoped requirement repair without direct canonical rewrites |

## Catalog object, privilege and later-source inventory

The companion JSON contains exact **10 named object** rows (**two present hosted-only write guards**, eight absent source-only objects), **four present table-privilege** rows (RLS remains enabled), and **33 pending source** rows classified `unknown`. Each row includes a source/evidence reference, System owner plus domain consult owner, dependency group and a non-executable remediation direction.

### Dependency-aware recovery direction (NOT authorization)

1. **System/Supabase migration owner:** preserve existing hosted-only platform write guards and reconcile notification ACL/RLS intent; do not replace them by clean-source parity.
2. **S13 authority:** establish a sanitized hosted-head-equivalent **disposable local** fixture and test a forward-only foundation without moving the immutable bootstrap boundary or manufacturing history.
3. **Archive / Task / Notifications and Televote / Results owners:** rehearse dependent transitions, receipts, published snapshots, correction/replay safety and negative role permissions locally; preserve existing canonical writers.
4. **Integrator/QA:** obtain exact candidate SHA Quality, local Browser, S13/S14/S15/S16, bundle and other required gates. This S01 evidence source is not itself release certification.
5. **Project owner:** separate explicit approval is still required for any **actual production migration, deployment or public-write reopening**. This task's approval allowed catalog inspection and safe documentation-only source work, not those operations.

## Verification and limits

- Source list came from the complete, nontruncated Git tree for `1297490c9367cf7c002f68059d681a1a094f739a`; history list from authorized read-only Supabase `list_migrations`. Both were version-joined with the immutable `20261014020000` boundary. No remote application data read.
- The 83-row ledger asserts no omitted/duplicate effect IDs; all rows retain `history_action: preserve`, nonempty evidence, dependency ownership and remediation, and `production_change_authorized: false`. Negative regression tests ensure a pending source file cannot be silently called `absent`.
- Even when a named effect is found, a complete SQL migration may contain additional uninspected effects. No whole-migration equivalence, full RLS behavior, external scheduler ownership, hosted-data compatibility, migration adoption, or release readiness is certified.
- Original [#2387](https://github.com/solarissongcontest/solarisstudio/pull/2387), [#2405](https://github.com/solarissongcontest/solarisstudio/pull/2405) and stacked [#2417](https://github.com/solarissongcontest/solarisstudio/pull/2417) remain separate draft/review candidates. Do not merge them just to satisfy S01.
