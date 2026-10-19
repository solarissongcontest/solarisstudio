import { describe, expect, it } from "vitest";
import {
  auditV3S13MigrationAdoption,
  classifyV3S13MigrationRisks,
} from "./v3-s13-migration-adoption-audit";

describe("System V3 S13 migration adoption audit", () => {
  it("classifies destructive and backfill-like SQL while ignoring comments", () => {
    expect(
      classifyV3S13MigrationRisks(`
        -- drop table public.not_really;
        /* truncate public.also_not_real; */
        update public.entries set metadata = '{}'::jsonb where metadata is null;
        alter table public.legacy drop column obsolete;
      `),
    ).toEqual(["backfill_like_dml", "destructive_ddl"]);
  });

  it("accepts a concrete migration-contract declaration", () => {
    const report = auditV3S13MigrationAdoption([
      {
        path: "supabase/migrations/20261019000000_example.sql",
        source: `
          insert into private.v3_migration_contracts (
            migration_key, schema_version, rollback_mode, destructive, reason
          ) values ('example.contract', 1, 'forward_fix_only', false, 'example');
          update public.entries set metadata = '{}'::jsonb where metadata is null;
        `,
      },
    ]);

    expect(report).toMatchObject({
      migrationCount: 1,
      adoptedCount: 1,
      exemptCount: 0,
      highRiskCount: 1,
      findingCount: 0,
    });
  });

  it("accepts only reasoned explicit exemptions", () => {
    const accepted = auditV3S13MigrationAdoption([
      {
        path: "supabase/migrations/20261019000001_exempt.sql",
        source: "-- V3-S13: exempt reason=metadata-only\nselect 1;",
      },
    ]);
    expect(accepted.findingCount).toBe(0);
    expect(accepted.exemptCount).toBe(1);

    const rejected = auditV3S13MigrationAdoption([
      {
        path: "supabase/migrations/20261019000002_bad_exempt.sql",
        source: "-- V3-S13: exempt\nselect 1;",
      },
    ]);
    expect(rejected.findings[0]?.finding).toBe("missing_s13_adoption");
  });

  it("distinguishes ordinary missing adoption from high-risk missing adoption", () => {
    const report = auditV3S13MigrationAdoption([
      {
        path: "supabase/migrations/20261019000003_additive.sql",
        source: "create index if not exists example_idx on public.entries(id);",
      },
      {
        path: "supabase/migrations/20261019000004_destructive.sql",
        source: "delete from public.legacy_rows where retired_at is not null;",
      },
    ]);

    expect(report.findings).toEqual([
      expect.objectContaining({
        path: "supabase/migrations/20261019000003_additive.sql",
        finding: "missing_s13_adoption",
        risks: [],
      }),
      expect.objectContaining({
        path: "supabase/migrations/20261019000004_destructive.sql",
        finding: "high_risk_without_contract",
        risks: ["bulk_delete"],
      }),
    ]);
  });
});
