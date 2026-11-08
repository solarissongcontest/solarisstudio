import { describe, expect, it } from "vitest";

import { computeCombined, type ComponentSourceInput } from "./combined-math";

const voteSource: ComponentSourceInput = {
  id: "jury",
  name: "Official voting points",
  type: "jury",
  inputMode: "converted_points",
  percentageWeight: 100,
  enabled: true,
  displayOrder: 0,
  values: { OLA: 35, VEN: 65 },
};

function resultWithCorrections(values: Record<string, number>) {
  return computeCombined({
    participants: ["OLA", "VEN"],
    totalPoints: 100,
    sources: [
      voteSource,
      {
        id: "official-deduction",
        name: "Reviewed fixed-point penalty",
        type: "correction",
        inputMode: "correction",
        correctionScope: "final",
        percentageWeight: 0,
        enabled: true,
        displayOrder: 1,
        values,
      },
    ],
  });
}

describe("SSC Regulations v4.2 Rule 17.2: signed final scores", () => {
  it("subtracts the entire reviewed deduction rather than silently stopping at zero", () => {
    const result = resultWithCorrections({ OLA: -50, VEN: 0 });
    expect(result.errors).toEqual([]);
    const penalized = result.rows.find((row) => row.code === "OLA");
    expect(penalized).toMatchObject({
      totalVotingPoints: 35,
      finalCorrection: -50,
      finalCombinedPoints: -15,
      finalRank: 2,
    });
    expect(result.rows[0]).toMatchObject({ code: "VEN", finalCombinedPoints: 65, finalRank: 1 });
    expect(result.allocatedTotal).toBe(100);
    expect(result.finalTotal).toBe(50);
  });

  it("preserves unchanged scores and orders signed totals without turning penalties into source points", () => {
    const result = resultWithCorrections({ OLA: -50, VEN: -80 });
    expect(result.errors).toEqual([]);
    expect(result.rows.map(({ code, finalCombinedPoints }) => ({ code, finalCombinedPoints }))).toEqual([
      { code: "VEN", finalCombinedPoints: -15 },
      { code: "OLA", finalCombinedPoints: -15 },
    ]);
    expect(result.rows.map((row) => row.finalRank)).toEqual([1, 2]);
    expect(result.rows.every((row) => row.totalVotingPoints >= 0)).toBe(true);

    const baseline = computeCombined({ participants: ["OLA", "VEN"], totalPoints: 100, sources: [voteSource] });
    expect(baseline.errors).toEqual([]);
    expect(baseline.rows.map((row) => row.finalCombinedPoints)).toEqual([65, 35]);
    expect(baseline.finalTotal).toBe(100);
  });
});
