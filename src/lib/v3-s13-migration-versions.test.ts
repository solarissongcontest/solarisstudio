import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditV3S13MigrationVersions } from "./v3-s13-migration-versions";

describe("System V3 S13 migration identity integrity", () => {
  it("accepts canonical, uniquely versioned migration names", () => {
    expect(
      auditV3S13MigrationVersions([
        "20261019111000_v3_s13_migration_hardening.sql",
        "20261101181812_v3_s13_adopt_rules_v4_1_roleplay_registry.sql",
      ]),
    ).toEqual({ filesChecked: 2, clean: true, issues: [] });
  });

  it("rejects collisions even when the suffixes are different", () => {
    expect(
      auditV3S13MigrationVersions([
        "20261104120000_second.sql",
        "20261104120000_first.sql",
      ]).issues,
    ).toEqual([
      {
        filename: "20261104120000_second.sql",
        reason: "duplicate_migration_version",
        version: "20261104120000",
        firstFilename: "20261104120000_first.sql",
      },
    ]);
  });

  it("rejects noncanonical SQL filenames rather than silently skipping them", () => {
    expect(
      auditV3S13MigrationVersions([
        "migration_without_version.sql",
        "20261104120000_UPPERCASE.sql",
        "20261104130000_valid.sql",
      ]),
    ).toMatchObject({
      clean: false,
      issues: [
        { filename: "20261104120000_UPPERCASE.sql", reason: "invalid_migration_filename" },
        { filename: "migration_without_version.sql", reason: "invalid_migration_filename" },
      ],
    });
  });

  it("checks historical and new versions together to catch backdated collisions", () => {
    const report = auditV3S13MigrationVersions([
      "20260901010000_old.sql",
      "20261104120000_new.sql",
      "20260901010000_backdated.sql",
    ]);
    expect(report.clean).toBe(false);
    expect(report.filesChecked).toBe(3);
    expect(report.issues).toEqual([
      {
        filename: "20260901010000_old.sql",
        reason: "duplicate_migration_version",
        version: "20260901010000",
        firstFilename: "20260901010000_backdated.sql",
      },
    ]);
  });

  it("keeps the entire-directory version check wired into the fail-closed S13 CI gate", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/check-v3-s13-migration-adoption.ts"),
      "utf8",
    );
    expect(script).toContain("auditV3S13MigrationVersions(sqlFilenames)");
    expect(script).toContain("migrationVersionIssueCount: versions.issues.length");
    expect(script).toContain("if (requireClean && !versions.clean) process.exit(1)");
  });
});
