import type { V3S13ReviewedMigrationExemption } from "./v3-s13-migration-adoption-audit";

/**
 * Reviewed exceptions for migrations created after the S13 framework boundary.
 *
 * The registry intentionally starts empty because the framework migration is
 * forward-stamped at the point S13 becomes enforceable. Do not pattern-match or
 * auto-grandfather future migrations. A future exception must be an exact path
 * with an allowed reason and human rationale, reviewed in the same change.
 */
export const V3_S13_REVIEWED_MIGRATION_EXEMPTIONS = [] as const satisfies readonly V3S13ReviewedMigrationExemption[];
