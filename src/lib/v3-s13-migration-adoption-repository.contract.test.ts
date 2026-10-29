import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditV3S13MigrationAdoption } from "./v3-s13-migration-adoption-audit";
import { V3_S13_REVIEWED_MIGRATION_EXEMPTIONS } from "./v3-s13-reviewed-migration-exemptions";

const FRAMEWORK_VERSION = "20261019111000";

function postFrameworkMigrations() {
  const directory = resolve(process.cwd(), "supabase/migrations");
  return readdirSync(directory)
    .filter((filename) => filename.endsWith(".sql"))
    .filter((filename) => {
      const version = /^(\d{14})_/.exec(filename)?.[1];
      return version !== undefined && version > FRAMEWORK_VERSION;
    })
    .sort()
    .map((filename) => ({
      path: `supabase/migrations/${filename}`,
      source: readFileSync(resolve(directory, filename), "utf8"),
    }));
}

describe("System V3 S13 repository adoption gate", () => {
  it("leaves no post-framework migration unclassified", () => {
    const report = auditV3S13MigrationAdoption(
      postFrameworkMigrations(),
      V3_S13_REVIEWED_MIGRATION_EXEMPTIONS,
    );

    expect(report.exemptionIssues).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("keeps historical exemption debt explicit, exact-path and forward-repaired", () => {
    expect(V3_S13_REVIEWED_MIGRATION_EXEMPTIONS).toHaveLength(1);
    expect(V3_S13_REVIEWED_MIGRATION_EXEMPTIONS[0]).toEqual({
      path: "supabase/migrations/20261022151607_batch_running_order_result_sync.sql",
      reason: "immutable_history_forward_repaired",
      rationale:
        "This post-S13 migration was merged without a concrete migration contract and may already exist in deployed migration history, so its bytes must not be rewritten. The semantic contract is registered forward by 20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql; all other post-S13 migrations remain fail-closed.",
    });
  });
});
