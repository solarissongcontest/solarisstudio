import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditV3S13MigrationAdoption } from "./v3-s13-migration-adoption-audit";
import { V3_S13_REVIEWED_MIGRATION_EXEMPTIONS } from "./v3-s13-reviewed-migration-exemptions";

const migrationPath =
  "supabase/migrations/20261022151607_batch_running_order_result_sync.sql";

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

  it("records exactly why the immutable migration is exempt", () => {
    expect(V3_S13_REVIEWED_MIGRATION_EXEMPTIONS).toEqual([
      {
        path: migrationPath,
        reason: "already_merged_immutable",
        rationale:
          "This migration was already merged to main before the S13 adoption gate identified its missing declaration. Migration history must remain byte-for-byte immutable. Review confirmed that its UPDATE is operational SQL inside the installed RPC, not a migration-time data backfill.",
      },
    ]);
  });
});
