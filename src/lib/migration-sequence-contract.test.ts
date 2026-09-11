import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const FEATURE_CHAIN = [
  "20260910213000_integrity_core.sql",
  "20260910213100_integrity_reporting_and_review.sql",
  "20260910213200_integrity_case_governance.sql",
  "20260910213300_integrity_evidence_vault.sql",
  "20260910214000_rulebook_governance.sql",
  "20260910214100_rulebook_release_inheritance.sql",
  "20260910214500_rulebook_release_chain.sql",
  "20260910215000_rulebook_release_validation.sql",
  "20260910215500_rulebook_ancestry_integrity.sql",
  "20260910220000_integrity_sanctions_and_appeals.sql",
  "20260910220100_integrity_reporter_appeals.sql",
  "20260910220200_integrity_appeal_extensions.sql",
  "20260910220300_integrity_appeal_queue.sql",
  "20260910220400_rule_interpretations.sql",
] as const;

describe("Supabase migration sequence", () => {
  it("never reuses a migration timestamp", () => {
    const timestamps = migrationFiles.map((name) => name.slice(0, 14));
    const duplicates = timestamps.filter((value, index) => timestamps.indexOf(value) !== index);
    expect([...new Set(duplicates)]).toEqual([]);
  });

  it("keeps the Rules + Integrity migration chain in dependency order", () => {
    for (const file of FEATURE_CHAIN) {
      expect(migrationFiles, `${file} is missing from supabase/migrations`).toContain(file);
    }

    const positions = FEATURE_CHAIN.map((file) => migrationFiles.indexOf(file));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("wraps every Rules + Integrity migration in an explicit transaction", () => {
    for (const file of FEATURE_CHAIN) {
      const sql = readFileSync(resolve(migrationDir, file), "utf8").trim();
      expect(sql.toLowerCase().startsWith("begin;"), `${file} should start with BEGIN`).toBe(true);
      expect(sql.toLowerCase().endsWith("commit;"), `${file} should end with COMMIT`).toBe(true);
    }
  });

  it("creates core case tables before sanctions, reporter appeals, extensions and organizer queues", () => {
    const corePosition = migrationFiles.indexOf("20260910213000_integrity_core.sql");
    const resolutionPosition = migrationFiles.indexOf("20260910220000_integrity_sanctions_and_appeals.sql");
    const reporterAppealPosition = migrationFiles.indexOf("20260910220100_integrity_reporter_appeals.sql");
    const extensionPosition = migrationFiles.indexOf("20260910220200_integrity_appeal_extensions.sql");
    const queuePosition = migrationFiles.indexOf("20260910220300_integrity_appeal_queue.sql");
    expect(corePosition).toBeGreaterThanOrEqual(0);
    expect(resolutionPosition).toBeGreaterThan(corePosition);
    expect(reporterAppealPosition).toBeGreaterThan(resolutionPosition);
    expect(extensionPosition).toBeGreaterThan(reporterAppealPosition);
    expect(queuePosition).toBeGreaterThan(extensionPosition);
  });

  it("creates interpretation governance after the base rulebook architecture exists", () => {
    const rulebookPosition = migrationFiles.indexOf("20260910214000_rulebook_governance.sql");
    const interpretationPosition = migrationFiles.indexOf("20260910220400_rule_interpretations.sql");
    expect(rulebookPosition).toBeGreaterThanOrEqual(0);
    expect(interpretationPosition).toBeGreaterThan(rulebookPosition);
  });
});
