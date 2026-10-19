import { describe, expect, it } from "vitest";
import {
  auditV3S13MigrationAdoption,
  classifyV3S13MigrationRisks,
  type V3S13ReviewedMigrationExemption,
} from "./v3-s13-migration-adoption-audit";

const migration = (name: string, source: string) => ({
  path: `supabase/migrations/${name}`,
  source,
});

const reviewed = (
  name: string,
  rationale = "Merged before the S13 gate existed.",
): V3S13ReviewedMigrationExemption => ({
  path: `supabase/migrations/${name}`,
  reason: "pre_framework_merge",
  rationale,
});

describe("System V3 S13 migration adoption audit", () => {
  it("classifies destructive and backfill-like SQL after stripping comments", () => {
    expect(
      classifyV3S13MigrationRisks(`
        -- delete from ignored_comment;
        /* drop table ignored_comment; */
        update private.example set migrated = true where migrated = false;
        alter table private.example drop column legacy;
      `),
    ).toEqual(["backfill_like_dml", "destructive_ddl"]);
  });

  it("accepts a concrete migration contract declaration but not a marker comment", () => {
    const concrete = migration(
      "20261020010000_concrete.sql",
      "select public.v3_register_migration_contract('v3.test',1,'forward_fix_only',false,null,'test');",
    );
    const commentOnly = migration(
      "20261020010100_comment.sql",
      "-- V3-S13: contract\ncreate table public.example(id uuid primary key);",
    );

    expect(auditV3S13MigrationAdoption([concrete]).clean).toBe(true);
    const commentReport = auditV3S13MigrationAdoption([commentOnly]);
    expect(commentReport.clean).toBe(false);
    expect(commentReport.findings[0]?.finding).toBe("missing_s13_adoption");
  });

  it("accepts an exact reviewed grandfather exemption", () => {
    const name = "20261020010200_grandfathered.sql";
    const report = auditV3S13MigrationAdoption(
      [migration(name, "create table public.example(id uuid primary key);")],
      [reviewed(name)],
    );

    expect(report).toMatchObject({
      clean: true,
      exemptCount: 1,
      findingCount: 0,
      exemptionIssueCount: 0,
    });
  });

  it("fails closed on duplicate, stale, invalid-path, empty-rationale, and invalid-reason exemptions", () => {
    const duplicateName = "20261020010300_present.sql";
    const emptyName = "20261020010800_empty.sql";
    const invalidReasonName = "20261020010900_reason.sql";
    const migrations = [
      migration(duplicateName, "create table public.example(id uuid primary key);"),
      migration(emptyName, "create table public.empty_example(id uuid primary key);"),
      migration(invalidReasonName, "create table public.reason_example(id uuid primary key);"),
    ];
    const invalidReason = {
      path: `supabase/migrations/${invalidReasonName}`,
      reason: "because_i_said_so",
      rationale: "Nope.",
    } as unknown as V3S13ReviewedMigrationExemption;

    const report = auditV3S13MigrationAdoption(migrations, [
      reviewed(duplicateName),
      reviewed(duplicateName),
      reviewed("20261020010400_missing.sql"),
      { ...reviewed("20261020010700_bad_path.sql"), path: "migrations/not-canonical.sql" },
      reviewed(emptyName, "   "),
      invalidReason,
    ]);

    expect(report.clean).toBe(false);
    expect(report.exemptionIssues.map((issue) => issue.issue)).toEqual([
      "duplicate_exemption",
      "stale_exemption",
      "invalid_exemption_path",
      "empty_exemption_rationale",
      "invalid_exemption_reason",
    ]);
  });

  it("reports unclassified high-risk migrations separately from ordinary adoption gaps", () => {
    const report = auditV3S13MigrationAdoption([
      migration(
        "20261020010500_backfill.sql",
        "update public.example set migrated = true where migrated = false;",
      ),
      migration(
        "20261020010600_additive.sql",
        "create table public.example_two(id uuid primary key);",
      ),
    ]);

    expect(report.clean).toBe(false);
    expect(report.findings.map((finding) => finding.finding)).toEqual([
      "high_risk_without_contract",
      "missing_s13_adoption",
    ]);
    expect(report.highRiskCount).toBe(1);
  });
});
