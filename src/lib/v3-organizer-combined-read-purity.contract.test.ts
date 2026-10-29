import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const functions = readFileSync(
  "src/integrations/televoting/combined.functions.ts",
  "utf8",
);

function functionSlice(start: string, end: string) {
  const from = functions.indexOf(start);
  const to = functions.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Could not locate ${start} → ${end}`);
  return functions.slice(from, to);
}

describe("V3 Organizer Combined Results read purity", () => {
  it("keeps the aggregation detail read observational", () => {
    const detailRead = functionSlice(
      "export const getMergedCombinedAggregation",
      "export const createMergedCombinedAggregation",
    );
    expect(detailRead).toContain("getMergedCombinedAggregationServer(data.id)");
    expect(detailRead).not.toContain("refreshCombinedCanonicalParticipants");
    expect(detailRead).not.toContain("syncEditableCombinedParticipantsFromSolarisServer");
  });

  it("retains canonical participant reconciliation on explicit consequential operations", () => {
    const participants = functionSlice(
      "export const setMergedCombinedParticipants",
      "export const upsertMergedCombinedSource",
    );
    const recalculate = functionSlice(
      "export const recalculateMergedCombined",
      "export const setMergedCombinedStatus",
    );
    const status = functionSlice(
      "export const setMergedCombinedStatus",
      "export const deleteMergedCombinedAggregation",
    );

    expect(participants).toContain("refreshCombinedCanonicalParticipants(data.id)");
    expect(recalculate).toContain("recalculateMergedCombinedServer(data)");
    const sql = readFileSync("supabase/migrations/20261029072852_v3_combined_calculation_authority.sql", "utf8");
    expect(sql).toContain("Canonical show lineup changed");
    expect(status).toContain('data.status === "locked" || data.status === "published"');
    expect(status).toContain("refreshCombinedCanonicalParticipants(data.id)");
  });

  it("does not claim the remaining global Combined authority is V3-complete", () => {
    expect(functions).toContain("listMergedCombinedAggregations");
    expect(functions).toContain("editionId?: string | null");
    expect(functions).not.toContain("expectedAggregationVersion");
    expect(functions).not.toContain("idempotencyKey");
  });
});
