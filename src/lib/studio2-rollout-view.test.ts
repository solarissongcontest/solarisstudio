import { describe, expect, it } from "vitest";

import type { SolarisFeatureFlag } from "./feature-flags";
import {
  STUDIO2_PRODUCT_SURFACE_LIST,
  studio2RolloutDecision,
  studio2SurfaceFor,
} from "./studio2-product-surfaces";
import {
  STUDIO2_ROLLOUT_VIEWS,
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

  it("keeps roadmap and external workstreams locked away from available rollout", () => {
    expect(rolloutViewFor(rows[2])).toBe("planned");
    expect(rolloutViewFor(rows[3])).toBe("external");
    expect(rowsForRolloutView(rows, "available").map((row) => row.key)).toEqual(["voting_lab"]);
    expect(studio2RolloutDecision("country_voting_dna", false, new Set()).allowed).toBe(false);
    expect(studio2RolloutDecision("rules_engine", false, new Set()).allowed).toBe(false);
  });

  it("classifies every registry feature into exactly one view", () => {
    const allRows = STUDIO2_PRODUCT_SURFACE_LIST.map((surface) => ({
      key: surface.key,
      enabled: surface.key === "official_communications",
    }));
    const memberships = new Map<SolarisFeatureFlag, string[]>();

    for (const view of STUDIO2_ROLLOUT_VIEWS) {
      for (const row of rowsForRolloutView(allRows, view.id)) {
        memberships.set(row.key, [...(memberships.get(row.key) ?? []), view.id]);
      }
    }

    expect(memberships.size).toBe(STUDIO2_PRODUCT_SURFACE_LIST.length);
    expect([...memberships.values()].every((views) => views.length === 1)).toBe(true);
  });

  it("keeps foundation consumers discoverable", () => {
    const stateEngineConsumers = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) =>
      surface.dependsOn?.includes("edition_state_engine"),
    );

    expect(studio2SurfaceFor("edition_state_engine").state).toBe("foundation");
    expect(stateEngineConsumers.length).toBeGreaterThan(0);
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
