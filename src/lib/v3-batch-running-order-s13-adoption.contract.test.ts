import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditV3S13MigrationAdoption } from "./v3-s13-migration-adoption-audit";

const path = "supabase/migrations/20261022151607_batch_running_order_result_sync.sql";
const migration = readFileSync(path, "utf8");

describe("batch running-order result sync S13 adoption", () => {
  it("registers an explicit forward-fix migration contract before changing runtime authority", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.batch-running-order-result-sync'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,\n  null,");
    expect(migration.indexOf("public.v3_register_migration_contract(")).toBeLessThan(
      migration.indexOf("drop trigger if exists participants_sync_results"),
    );
  });

  it("remains clean under the canonical S13 adoption audit despite conservative DML risk detection", () => {
    const report = auditV3S13MigrationAdoption([{ path, source: migration }]);

    expect(report.highRiskCount).toBe(1);
    expect(report.adoptedCount).toBe(1);
    expect(report.findings).toEqual([]);
    expect(report.clean).toBe(true);
  });
});
