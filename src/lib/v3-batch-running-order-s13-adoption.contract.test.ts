import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditV3S13MigrationAdoption } from "./v3-s13-migration-adoption-audit";
import { V3_S13_REVIEWED_MIGRATION_EXEMPTIONS } from "./v3-s13-reviewed-migration-exemptions";

const migrationPath =
  "supabase/migrations/20261022151607_batch_running_order_result_sync.sql";
const forwardRepairPath =
  "supabase/migrations/20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql";

const migration = readFileSync(migrationPath, "utf8");

describe("batch running-order S13 adoption", () => {
  it("keeps the already-merged migration immutable and explicitly reviewed", () => {
    expect(migration).not.toContain("v3_register_migration_contract");

    const report = auditV3S13MigrationAdoption(
      [
        {
          path: migrationPath,
          source: migration,
        },
      ],
      V3_S13_REVIEWED_MIGRATION_EXEMPTIONS,
    );

    expect(report.highRiskCount).toBe(1);
    expect(report.adoptedCount).toBe(0);
    expect(report.exemptCount).toBe(1);
    expect(report.findings).toEqual([]);
    expect(report.exemptionIssues).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("records exactly why the immutable migration is exempt and names its forward repair", () => {
    expect(V3_S13_REVIEWED_MIGRATION_EXEMPTIONS).toEqual([
      {
        path: migrationPath,
        reason: "immutable_history_forward_repaired",
        rationale:
          "This post-S13 migration was merged without a concrete migration contract and may already exist in deployed migration history, so its bytes must not be rewritten. The semantic contract is registered forward by 20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql; all other post-S13 migrations remain fail-closed.",
      },
    ]);

    const forwardRepair = readFileSync(forwardRepairPath, "utf8");
    expect(forwardRepair).toContain("v3_register_migration_contract");
    expect(forwardRepair).toContain("v3.results.batch-running-order-result-sync-v1");
    expect(forwardRepair).toContain("forward_fix_only");
  });
});
