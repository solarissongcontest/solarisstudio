import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const adapter = source("scripts/v3-s14-materialize-televote-results.ts");
const productionConversion = source("src/integrations/televoting/conversion.server.ts");
const robustMigration = source("supabase/migrations/20260906154000_robust_televote_v2.sql");

describe("S14 Televote materialization adapter", () => {
  it("supports the canonical robust-v2 default with the production calculation contract", () => {
    expect(robustMigration).toContain("alter column televote_engine_version set default 'robust-televote-v2'");
    expect(productionConversion).toContain("persistV2Calculation");
    expect(productionConversion).toContain("convertRobustRound");

    expect(adapter).toContain("ROBUST_TELEVOTE_ENGINE_VERSION");
    expect(adapter).toContain("convertRobustRound");
    expect(adapter).toContain("engine_version: ROBUST_TELEVOTE_ENGINE_VERSION");
    expect(adapter).toContain("effective_points: row.effectivePoints");
    expect(adapter).toContain("robust_support: row.robustSupport");
    expect(adapter).not.toContain("supports only the canonical");
  });

  it("retains legacy v1 materialization and the destructive-local safety boundary", () => {
    expect(adapter).toContain("CALC_ENGINE_VERSION");
    expect(adapter).toContain("convertRound");
    expect(adapter).toContain("refusing non-local Supabase URL");
    expect(adapter).toContain('process.env.V3_VERIFICATION_TARGET !== "local"');
    expect(adapter).toContain('process.env.V3_DESTRUCTIVE_VERIFICATION !== "1"');
    expect(adapter).toContain('from("televote_votes")');
    expect(adapter).toContain('from("round_results")');
  });
});
