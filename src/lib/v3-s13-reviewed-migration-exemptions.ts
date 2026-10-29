import type { V3S13ReviewedMigrationExemption } from "./v3-s13-migration-adoption-audit";

/**
 * Reviewed exceptions for migrations created after the S13 framework boundary.
 *
 * Exceptions are exact-path only. They exist for immutable migration history
 * that cannot be rewritten safely after merge/deployment. A forward-repaired
 * exception must name the compensating migration in its rationale so the debt
 * remains auditable rather than becoming a quiet grandfathering mechanism.
 */
export const V3_S13_REVIEWED_MIGRATION_EXEMPTIONS = [
  {
    path: "supabase/migrations/20261022151607_batch_running_order_result_sync.sql",
    reason: "immutable_history_forward_repaired",
    rationale:
      "This post-S13 migration was merged without a concrete migration contract and may already exist in deployed migration history, so its bytes must not be rewritten. The semantic contract is registered forward by 20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql; all other post-S13 migrations remain fail-closed.",
  },
  {
    path: "supabase/migrations/20261029151500_v3_s16_confirmation_derived_trigger_authority.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Already-pushed System lane migration; preserve immutable SQL history. Its concrete semantic migration contract is registered by 20261029170000_v3_integrated_system_lane_adoption.sql and verified by local replay and current-main upgrade.",
  },
  {
    path: "supabase/migrations/20261029153500_v3_s16_confirmation_cas_and_grants.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Already-pushed System lane migration; preserve immutable SQL history. Its concrete semantic migration contract is registered by 20261029170000_v3_integrated_system_lane_adoption.sql and verified by local replay and current-main upgrade.",
  },
  {
    path: "supabase/migrations/20261029160000_v3_s16_jury_window_single_authority.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Already-pushed System lane migration; preserve immutable SQL history. Its concrete semantic migration contract is registered by 20261029170000_v3_integrated_system_lane_adoption.sql and verified by local replay and current-main upgrade.",
  },
  {
    path: "supabase/migrations/20261029162500_v3_s16_jury_transport_boundary.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Already-pushed System lane migration; preserve immutable SQL history. Its concrete semantic migration contract is registered by 20261029170000_v3_integrated_system_lane_adoption.sql and verified by local replay and current-main upgrade.",
  },
  {
    path: "supabase/migrations/20261029165000_v3_s16_jury_scope_constraints.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Already-pushed System lane migration; preserve immutable SQL history. Its concrete semantic migration contract is registered by 20261029170000_v3_integrated_system_lane_adoption.sql and verified by local replay and current-main upgrade.",
  },
  {
    path: "supabase/migrations/20261029192000_v3_s16_harden_shared_internal_authority.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Published coordinator migration; preserve immutable history. Forward adoption in 20261029225000_v3_shared_runtime_adoption.sql binds sha256:e6025e9a3c2214fde04ff70399254272b14205ec60771467b4a80f5819416093.",
  },
  {
    path: "supabase/migrations/20261029221500_v3_s16_shared_runtime_authority_cutover.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Published coordinator migration; preserve immutable history. Forward adoption in 20261029225000_v3_shared_runtime_adoption.sql binds sha256:f7e1b1615c4be4e0d1d329e674e4a8f2e25bbfab55d67d59f30a3d6e12f52777.",
  },
  {
    path: "supabase/migrations/20261029222500_v3_s16_retire_legacy_jury_score_writers.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Published coordinator migration; preserve immutable history. Forward adoption in 20261029225000_v3_shared_runtime_adoption.sql binds sha256:db4f92b845089408be70fd68010448b52dc239bf331fe65d95d1fbfaceaf521b.",
  },
  {
    path: "supabase/migrations/20261029223500_v3_s16_pin_shared_internal_mechanisms.sql",
    reason: "immutable_history_forward_repaired",
    rationale: "Published coordinator migration; preserve immutable history. Forward adoption in 20261029225000_v3_shared_runtime_adoption.sql binds sha256:8aa19c5523171626bf1ce5df72639ff61c8d056d5d955e57f44216f6ac1f6993.",
  },
] as const satisfies readonly V3S13ReviewedMigrationExemption[];
