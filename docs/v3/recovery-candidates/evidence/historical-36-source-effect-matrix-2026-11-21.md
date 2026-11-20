# 36 missing-history V3 source effects: live reconciliation status, 21 November 2026

**Audit type:** manual, bounded production `pg_catalog`/grant/source body inspections. This is **not** the remote migration ledger, a post-merge release certificate, or a source-equivalent restored-data verification.

- Project: `dkxmnvekiopyesuzggeu` · database `postgres` · PostgreSQL 17.11
- GitHub source reviewed at `94546072463fd9cbd3c6d8a00cd5fcaa37288f0a`.
- The hosted `supabase_migrations.schema_migrations` history remains **497 entries**, tip `20261101181812`. The **36 historical identities are still missing**, and no fake ledger repair has occurred.
- Counts by source effects: `11` newly/effect verified (including the earlier S13 foundation), `2` previously satisfied ACL-only effects, `2` partial, `1` obsolete intermediate window to reconcile, and `20` pending/unqualified. **Do not interpret this as 36 migrations to replay** or as complete effect equivalence based only on object presence.
- Exact historical SQL files are immutable. Legacy ledger gaps are not automatically safe to repair. New effect SQL must be forward-only, dependency-ordered, independently rehearsed against the restored owner/ACL baseline, and protected by exact-target preflight and postcheck.

### A · S14 Televote source/projection

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261017001000_v3_s14_televote_result_truth.sql` | PENDING | New source table and projection routines absent |
| `20261017001010_v3_s14_televote_projection_guard_hardening.sql` | PENDING | Guard function absent |
| `20261017001020_v3_s14_televote_projection_replay_hardening.sql` | PENDING | Projection snapshot/replay functions absent |

### B · S5/S6/HTTP409/rollout

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261017123000_v3_s5_acknowledgement_consequences.sql` | PENDING | Event/consequence helpers absent |
| `20261018024500_v3_entry_review_conflict_http409.sql` | EFFECT VERIFIED | Reviewed canonical Entry-review body installed exactly; ACL/owner unchanged |
| `20261018031000_v3_http409_deterministic_conflicts.sql` | EFFECT VERIFIED | 28 canonical RPCs changed 40001 to PT409; no other prosrc/ACL drift |
| `20261018053000_v3_s6_confirmation_requirement_reconciliation.sql` | EFFECT VERIFIED | Service-only read-only verifier installed, canonical body exact |
| `20261018081500_v3_s5_entry_lifecycle_consequences.sql` | PENDING | Entry event/consequence helpers and triggers absent |
| `20261018111500_v3_confirmation_sync_service_role_privileges.sql` | EXISTING EFFECT VERIFIED | All 20 expected service-role table privileges satisfied before this pass |
| `20261018122500_v3_voting_declaration_expected_edition_scope.sql` | EFFECT VERIFIED | Two canonical reviewed-edition RPC overloads installed; exact bodies, owner and grants verified |
| `20261019000500_v3_confirmation_sync_publication_event_service_role.sql` | EXISTING EFFECT VERIFIED | service_role execute true; anon/authenticated false |
| `20261019013000_v3_public_live_rollout_flag.sql` | EFFECT VERIFIED | Feature CHECK extended by exactly one key; new flag disabled |

### C · S9/S10 observability

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261019110000_v3_s9_safe_metrics.sql` | EFFECT VERIFIED | Three time indexes and canonical read-only observability RPC installed |
| `20261019112000_v3_s10_sli_snapshot.sql` | EFFECT VERIFIED | S10 canonical SLI RPC and semantic contract installed |

### D · S13/S6 registration

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261019111000_v3_s13_migration_hardening.sql` | EFFECT VERIFIED | Earlier S13 dark foundation package installed and postchecked: five tables/seven RPCs |
| `20261019112900_v3_s13_migration_registration_context.sql` | SUPERSEDED WINDOW, REVIEW | Live final strict function must not be rolled backward into temporary filename-alias mode; historical context key absent |
| `20261019113000_v3_s6_notification_reconciliation.sql` | PENDING | Notification reconcile routines absent |
| `20261019113100_v3_s6_notification_reactivation.sql` | PENDING | Notification reactivation routine absent |
| `20261019113200_v3_s6_notification_failure_visibility.sql` | PENDING | Canonical final verifier definition absent; semantic contract absent |
| `20261019113300_v3_s13_strict_registration_restore.sql` | EFFECT VERIFIED | Current strict register-function body exactly matches canonical SQL, one semantic contract seed exists |
| `20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql` | EFFECT VERIFIED | Service-only bounded repair RPC and semantic seed installed, no real editions repaired |

### E · S14 Archive

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261019112100_v3_s14_archive_consequence_reconciliation.sql` | PENDING | Archive transition/gate helpers absent |
| `20261019112200_v3_s14_final_results_readiness_hardening.sql` | PENDING | Edition-final-results readiness helper absent |
| `20261019112300_v3_s14_transition_http409.sql` | PENDING | V3 transition function missing; cannot apply standalone |
| `20261019112400_v3_s14_archive_task_registry_alignment.sql` | PENDING | Task-type classifier/non-resurrection guard absent |
| `20261019112500_v3_s14_resolved_task_notification_invariant.sql` | PENDING | Resolved-task projection trigger absent |
| `20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql` | PENDING | Reconciliation helper absent |
| `20261020130000_v3_s14_archive_invariant_forward_fixes.sql` | PENDING | Runtime/legacy/Televote guards absent |
| `20261020140000_v3_s14_archive_runtime_update_guard.sql` | PENDING | Runtime UPDATE trigger absent |
| `20261021110000_v3_s14_archive_guard_authority_forward_fix.sql` | PENDING | One-shot runtime transition gate absent |
| `20261021161000_v3_s14_task_reconciliation_service_boundary.sql` | PARTIAL | Aggregate Task reconciler exists; prior snapshot showed missing service-role EXECUTE, needs current ACL proof |
| `20261021163000_v3_s14_failed_task_delivery_evidence.sql` | PENDING | Failed-delivery/gate helpers absent |
| `20261021202000_v3_s14_archive_reconciliation_convergence.sql` | PARTIAL | Aggregate Task reconciler exists; convergence gate/helper missing |

### F · Running-order/Results

| Historical source ID and stem | Current effect status | Evidence summary |
| --- | --- | --- |
| `20261022151607_batch_running_order_result_sync.sql` | PENDING | New running-order sync trigger/helper absent; existing admin writer needs compatibility review |
| `20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql` | PENDING | Requires prior running-order effect and S13 semantic registration |
| `20261024170500_v3_public_published_result_snapshot.sql` | EFFECT VERIFIED | Canonical version-bound Results snapshot RPC and semantic contract installed |

## Integration decision

The archived source's S14 **preflight** now passes read-only on the live production schema, after the earlier S13 foundation installation. This means its checked tables/columns/helpers currently exist; it does **not** certify running the 112 kB LOCAL-ONLY integrated Archive candidate in production. It installs official workflow/Archive guards and reconciliation authority and still lacks the full private-archive clone receipt and real recovered-contest lifecycle proof. The S14 Televote source-of-truth/projection guard requires its own separate mutation-authorization and Results snapshot proof.

The strict S13 registration function already matches source byte-for-byte; **never reinstall the older temporary alias function** merely because its historical timestamp is absent. Similarly, do not repeat the already-present 20 Confirmation sync grants, public Entry-event service grant, S9/S10/Results RPCs, or HTTP409 replacements.

Next integration order: finish S6 Notification three-stage forward effects with strict semantic registration and local real-role tests; verify S5 Entry/acknowledgement triggers and source truth; qualify S14 Televote; install reviewed and scoped S14 Archive invariants, then running-order/Results adoption and remaining Confirmation bounded repair. Keep voting/Archive publication writers gated until exact-head CI, isolation, recovery and lifecycle results pass. No CI, browser audit, or migration rehearsal may access production Supabase.
