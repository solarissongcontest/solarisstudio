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

  it("rejects malformed calendar instants for all November-2026 onward migrations", () => {
    const invalid = auditV3S13MigrationVersions([
      "20261107006000_v3_tg15_invalid_minutes.sql",
      "20261104126000_v3_tg6_invalid_minutes.sql",
      "20261131010000_impossible_november_day.sql",
      "20270229010000_impossible_non_leap_february.sql",
    ]);
    expect(invalid.clean).toBe(false);
    expect(invalid.issues).toEqual([
      {
        filename: "20261104126000_v3_tg6_invalid_minutes.sql",
        reason: "invalid_migration_calendar_version",
        version: "20261104126000",
      },
      {
        filename: "20261107006000_v3_tg15_invalid_minutes.sql",
        reason: "invalid_migration_calendar_version",
        version: "20261107006000",
      },
      {
        filename: "20261131010000_impossible_november_day.sql",
        reason: "invalid_migration_calendar_version",
        version: "20261131010000",
      },
      {
        filename: "20270229010000_impossible_non_leap_february.sql",
        reason: "invalid_migration_calendar_version",
        version: "20270229010000",
      },
    ]);
  });

  it("accepts valid boundary times and grandfathered older synthetic identifiers", () => {
    const report = auditV3S13MigrationVersions([
      "20260817242000_legacy_synthetic_identifier.sql",
      "20261003018000_legacy_synthetic_identifier.sql",
      "20261104125100_v3_tg6_valid_reschedule.sql",
      "20261107005500_v3_tg15_valid_founder_intake.sql",
      "20280229000000_valid_leap_february.sql",
    ]);
    expect(report).toEqual({ filesChecked: 5, clean: true, issues: [] });
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
