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

  it("keeps reviewed immutable-history exemptions exact and bounded", () => {
    expect(V3_S13_REVIEWED_MIGRATION_EXEMPTIONS).toEqual([
      {
        path: "supabase/migrations/20261022151607_batch_running_order_result_sync.sql",
        reason: "already_merged_immutable",
        rationale:
          "This migration was already merged to main before the S13 adoption gate identified its missing declaration. Migration history must remain byte-for-byte immutable. Review confirmed that its UPDATE is operational SQL inside the installed RPC, not a migration-time data backfill.",
      },
    ]);
  });
});
