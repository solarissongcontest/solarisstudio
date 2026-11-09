import type { V3SchemaEffectClassification } from "./v3-production-schema-effect-reconciliation";

export type V3SchemaEffectMatrixEntry = {
  filename: string;
  classification: V3SchemaEffectClassification;
  evidenceRefs: readonly string[];
  dependencies: readonly string[];
  forwardPlan: string | null;
};

const catalog = "read-only-catalog:2026-11-07";
const source = "source-comparison:2026-11-07";
const plan = (text: string) => `owner-review: ${text}`;

export const V3_PRODUCTION_SCHEMA_EFFECT_MATRIX: readonly V3SchemaEffectMatrixEntry[] = [
  ["20261017001000_v3_s14_televote_result_truth.sql", "effect-missing", "s14-televote-source-truth", "s14-vote-projection", "establish source-managed projection contract before guard recovery"],
  ["20261017001010_v3_s14_televote_projection_guard_hardening.sql", "effect-missing", "s14-televote-guard-absent", "s14-televote-source-truth", "integrate the owned S14 guard candidate after source truth"],
  ["20261017001020_v3_s14_televote_projection_replay_hardening.sql", "effect-missing", "s14-televote-replay-snapshot-absent", "s14-televote-source-truth", "define projection snapshot and compare legacy result-sync semantics"],
  ["20261017123000_v3_s5_acknowledgement_consequences.sql", "effect-partial", "acknowledgement-rpc-present", "s4-domain-outbox", "add event consequence emission without replacing acknowledgement receipts"],
  ["20261018024500_v3_entry_review_conflict_http409.sql", "effect-partial", "entry-review-rpc-40001", "s8-conflict-contract", "review bounded conflict mapping for the existing entry-review command"],
  ["20261018031000_v3_http409_deterministic_conflicts.sql", "effect-missing", "28-signature-40001-scan", "s8-conflict-contract", "classify and update only the allowlisted deterministic conflict signatures"],
  ["20261018053000_v3_s6_confirmation_requirement_reconciliation.sql", "effect-missing", "confirmation-requirement-rpc-absent", "confirmation-domain", "define scoped confirmation requirement verification"],
  ["20261018081500_v3_s5_entry_lifecycle_consequences.sql", "effect-partial", "entry-event-processor-present", "s4-domain-outbox", "add missing entry lifecycle emitters with one canonical producer"],
  ["20261018111500_v3_confirmation_sync_service_role_privileges.sql", "effect-partial", "confirmation-select-grants-partial-audit", "confirmation-domain", "complete exact grant comparison before changing privileges"],
  ["20261018122500_v3_voting_declaration_expected_edition_scope.sql", "effect-partial", "legacy-voting-rpcs-present", "voting-declaration-domain", "verify expected-edition overload signatures and ACLs"],
  ["20261019000500_v3_confirmation_sync_publication_event_service_role.sql", "effect-partial", "publication-event-service-grant-present", "publication-domain", "retain existing grant and prove full source privilege parity"],
  ["20261019013000_v3_public_live_rollout_flag.sql", "effect-missing", "live-rollout-key-absent", "public-rollout-authority", "prepare guarded flag support without enabling Live"],
  ["20261019110000_v3_s9_safe_metrics.sql", "effect-missing", "s9-rpc-and-indexes-absent", "s13-foundation", "integrate owned S9 candidate after S13 authority"],
  ["20261019111000_v3_s13_migration_hardening.sql", "effect-missing", "s13-five-tables-seven-rpcs-absent", "migration-owner-authority", "integrate the tested S13 forward-only foundation candidate"],
  ["20261019112000_v3_s10_sli_snapshot.sql", "effect-missing", "s10-rpc-absent", "s9-safe-metrics,s13-foundation", "integrate owned S10 candidate after S9 and S13"],
  ["20261019112100_v3_s14_archive_consequence_reconciliation.sql", "effect-missing", "archive-transition-rpc-absent", "s14-archive-authority", "define archive transition contract against hosted-equivalent lifecycle state"],
  ["20261019112200_v3_s14_final_results_readiness_hardening.sql", "effect-missing", "final-results-readiness-absent", "canonical-results,publication", "bind archive readiness to immutable published Results"],
  ["20261019112300_v3_s14_transition_http409.sql", "effect-uncertain", "transition-rpc-prerequisite-absent", "s14-archive-authority", "compare conflict semantics after the versioned transition command exists"],
  ["20261019112400_v3_s14_archive_task_registry_alignment.sql", "effect-missing", "archive-task-guards-absent", "s14-archive-authority", "add terminal archive task registry and resurrection guards"],
  ["20261019112500_v3_s14_resolved_task_notification_invariant.sql", "effect-missing", "resolved-task-projection-absent", "s6-notification-reconciliation", "add resolved-task delivery invariant without rewriting outcomes"],
  ["20261019112900_v3_s13_migration_registration_context.sql", "effect-uncertain", "s13-registration-rpc-absent", "s13-foundation,s6-notification-window", "review semantic registration context after the strict S13 foundation"],
  ["20261019113000_v3_s6_notification_reconciliation.sql", "effect-missing", "notification-reconciliation-rpcs-absent", "s13-foundation", "define service-only notification candidate and verifier"],
  ["20261019113100_v3_s6_notification_reactivation.sql", "effect-missing", "notification-reactivation-absent", "s6-notification-reconciliation", "reactivate only unresolved notifications without rewriting sent or failed outcomes"],
  ["20261019113200_v3_s6_notification_failure_visibility.sql", "effect-missing", "notification-verifier-absent", "s6-notification-reconciliation", "expose drift as failure evidence rather than healthy convergence"],
  ["20261019113300_v3_s13_strict_registration_restore.sql", "effect-uncertain", "s13-strict-rpc-absent", "s13-foundation,s6-notification-window", "retain the tested strict semantic registration contract"],
  ["20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql", "effect-missing", "resolved-task-reconciler-absent", "s14-task-registry,s6-notification-reconciliation", "add bounded resolved-task delivery reconciliation"],
  ["20261020130000_v3_s14_archive_invariant_forward_fixes.sql", "effect-missing", "archive-runtime-guards-absent", "s14-archive-authority", "add archive insert/delete invariants"],
  ["20261020140000_v3_s14_archive_runtime_update_guard.sql", "effect-missing", "archive-update-guard-absent", "s14-archive-authority", "add archive runtime update guard"],
  ["20261021110000_v3_s14_archive_guard_authority_forward_fix.sql", "effect-missing", "archive-one-shot-gate-absent", "s14-archive-authority", "use unforgeable one-shot transition authority"],
  ["20261021161000_v3_s14_task_reconciliation_service_boundary.sql", "effect-uncertain", "aggregate-task-reconciler-present", "s14-task-registry", "complete exact service-role execution and dependency comparison"],
  ["20261021163000_v3_s14_failed_task_delivery_evidence.sql", "effect-missing", "failed-delivery-gate-absent", "s14-task-registry,s6-notification-reconciliation", "preserve failed delivery evidence through archive reconciliation"],
  ["20261021202000_v3_s14_archive_reconciliation_convergence.sql", "effect-uncertain", "aggregate-task-reconciler-present", "s14-task-registry,s14-archive-authority", "compare exact archive resolver and notification convergence semantics"],
  ["20261022151607_batch_running_order_result_sync.sql", "effect-missing", "running-order-sync-trigger-absent", "canonical-results", "add statement-level running-order result synchronization"],
  ["20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql", "effect-uncertain", "s13-contract-registry-absent", "s13-foundation,running-order-sync", "adopt running-order synchronization only after compatibility proof"],
  ["20261024170500_v3_public_published_result_snapshot.sql", "effect-missing", "published-result-snapshot-absent", "canonical-results,publication", "add immutable publication-bound Results snapshot"],
  ["20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql", "effect-missing", "bounded-repair-rpc-absent", "confirmation-domain,s13-foundation", "add scoped requirement repair without direct canonical rewrites"],
].map(([filename, classification, evidence, dependencies, forwardPlan]) => ({
  filename,
  classification: classification as V3SchemaEffectClassification,
  evidenceRefs: [catalog, source, evidence],
  dependencies: dependencies.split(","),
  forwardPlan: plan(forwardPlan),
}));

export const V3_PRODUCTION_PENDING_MIGRATION_LANES = {
  worldAuthorityPrivacy: [
    "20261102170500_v3_tg1_world_country_control_foundation.sql",
    "20261102171500_v3_tg2_world_institution_core.sql",
    "20261102171600_v3_tg2_world_institution_access.sql",
    "20261102171700_v3_tg2_world_office_term_canonical_alignment.sql",
    "20261102171800_v3_tg2_world_office_term_dependents.sql",
    "20261102171950_v3_tg1_current_controller_identity_guard.sql",
    "20261104115831_v3_tg2_world_identity_linkage_privacy.sql",
    "20261104120600_v3_tg1_controller_login_privacy.sql",
    "20261104120800_v3_tg2_nonpublic_organ_office_privacy.sql",
    "20261104120900_v3_tg2_cross_organization_organ_integrity.sql",
    "20261104121000_v3_tg3_world_public_rollout_flag.sql",
    "20261104121500_v3_tg2_office_term_effective_authority.sql",
    "20261104121600_v3_tg2_membership_effective_representation.sql",
    "20261104165500_v3_tg8_exact_rational_legislative_tally.sql",
  ],
  resultsPublicationTelevote: [
    "20261103004500_v3_s14_atomic_televote_calculation.sql",
    "20261103004600_v3_canonical_result_recalculation.sql",
    "20261103004700_v3_result_reconciliation_hardening.sql",
    "20261103004800_v3_s14_televoting_round_bindings_runtime_access.sql",
    "20261103004900_v3_result_countback_parity.sql",
    "20261103090202_v3_results_jury_review_invalidation.sql",
    "20261103194500_v3_s14_televote_sync_service_role_acl.sql",
    "20261103210000_v3_s14_televote_sync_audit_rpc.sql",
    "20261103220000_v3_s14_atomic_televote_recovery.sql",
    "20261103220001_v3_qualification_null_rank_reset.sql",
    "20261104132500_v3_s14_results_reconciliation_authority.sql",
    "20261104135245_v3_results_active_snapshot_and_qualification.sql",
    "20261104185330_v3_publication_control_initialization_retry.sql",
    "20261105140500_v3_televote_influence_role_runtime_access.sql",
  ],
  crossCuttingRuntime: [
    "20261102205000_v3_service_role_claim_compatibility.sql",
    "20261104110000_v3_reference_literal_search.sql",
    "20261105045922_v3_pending_nf_winner_worker_authority.sql",
    "20261105115452_v3_edition_metadata_command.sql",
  ],
} as const;
