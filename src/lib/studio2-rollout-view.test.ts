import { describe, expect, it } from "vitest";

import type { SolarisFeatureFlag } from "./feature-flags";
import {
  rolloutViewCounts,
  rolloutViewFor,
  rowsForRolloutView,
} from "./studio2-rollout-view";

type Row = { key: SolarisFeatureFlag; enabled: boolean };

const rows: Row[] = [
  { key: "official_communications", enabled: true },
  { key: "permission_engine_v2", enabled: false },
  { key: "country_voting_dna", enabled: false },
  { key: "rules_engine", enabled: false },
  { key: "voting_lab", enabled: false },
];

describe("Studio 2 rollout views", () => {
  it("separates live products from foundations and disabled rollout-ready products", () => {
    expect(rolloutViewFor(rows[0])).toBe("active");
    expect(rolloutViewFor(rows[1])).toBe("foundations");
    expect(rolloutViewFor(rows[4])).toBe("available");
  });

  it("keeps roadmap and external workstreams visibly locked away from available rollout", () => {
    expect(rolloutViewFor(rows[2])).toBe("planned");
    expect(rolloutViewFor(rows[3])).toBe("external");
    expect(rowsForRolloutView(rows, "available").map((row) => row.key)).toEqual(["voting_lab"]);
  });

  it("returns stable counts for the five rollout views", () => {
    expect(rolloutViewCounts(rows)).toEqual({
      active: 1,
      foundations: 1,
      available: 1,
      planned: 1,
      external: 1,
    });
  });
});
