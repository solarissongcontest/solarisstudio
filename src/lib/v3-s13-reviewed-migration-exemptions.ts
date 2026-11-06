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
    path: "supabase/migrations/20261101181144_rules_v4_1_roleplay_registry.sql",
    reason: "immutable_history_forward_repaired",
    rationale:
      "The Rules v4.1 Chapter 22 registry migration was applied to production before S13 static adoption detected the missing contract, so its deployed bytes must remain immutable. The semantic contract is registered forward by 20261101181812_v3_s13_adopt_rules_v4_1_roleplay_registry.sql; the registry data itself is additive and already verified in production.",
  },
] as const satisfies readonly V3S13ReviewedMigrationExemption[];