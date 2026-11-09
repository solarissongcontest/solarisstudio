import { describe, expect, it } from "vitest";
import {
  V3_PRODUCTION_PENDING_MIGRATION_LANES,
  V3_PRODUCTION_SCHEMA_EFFECT_MATRIX,
} from "./v3-production-schema-effect-matrix";

describe("V3 production schema-effect matrix", () => {
  it("covers the complete 36-gap inventory exactly once", () => {
    expect(V3_PRODUCTION_SCHEMA_EFFECT_MATRIX).toHaveLength(36);
    expect(new Set(V3_PRODUCTION_SCHEMA_EFFECT_MATRIX.map((entry) => entry.filename)).size).toBe(36);
    expect(V3_PRODUCTION_SCHEMA_EFFECT_MATRIX.every((entry) =>
      entry.evidenceRefs.length >= 3 &&
      entry.dependencies.length > 0 &&
      (entry.classification === "effect-present" || entry.forwardPlan !== null),
    )).toBe(true);
  });

  it("assigns every pending lane exactly once", () => {
    const files = Object.values(V3_PRODUCTION_PENDING_MIGRATION_LANES).flat();
    expect(files).toHaveLength(32);
    expect(new Set(files).size).toBe(32);
  });
});
