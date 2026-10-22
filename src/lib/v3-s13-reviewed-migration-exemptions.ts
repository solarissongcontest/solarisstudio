import type { V3S13ReviewedMigrationExemption } from "./v3-s13-migration-adoption-audit";

/**
 * Reviewed exceptions for migrations created after the S13 framework boundary.
 *
 * Exceptions must name one exact migration path, use an explicitly supported
 * reason, and carry a human-reviewed rationale. Never pattern-match or
 * auto-grandfather future migrations.
 */
export const V3_S13_REVIEWED_MIGRATION_EXEMPTIONS = [
  {
    path: "supabase/migrations/20261022151607_batch_running_order_result_sync.sql",
    reason: "already_merged_immutable",
    rationale:
      "This migration was already merged to main before the S13 adoption gate identified its missing declaration. Migration history must remain byte-for-byte immutable. Review confirmed that its UPDATE is operational SQL inside the installed RPC, not a migration-time data backfill.",
  },
] as const satisfies readonly V3S13ReviewedMigrationExemption[];