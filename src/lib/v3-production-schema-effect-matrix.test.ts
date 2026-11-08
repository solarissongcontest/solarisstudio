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

  it("records the six 8 November catalog resolutions without treating partial effects as deployed", () => {
    const classifications = Object.fromEntries(
      V3_PRODUCTION_SCHEMA_EFFECT_MATRIX.map((entry) => [entry.filename, entry.classification]),
    );
    expect(Object.values(classifications).filter((kind) => kind === "effect-missing")).toHaveLength(28);
    expect(Object.values(classifications).filter((kind) => kind === "effect-partial")).toHaveLength(8);
    expect(Object.values(classifications).filter((kind) => kind === "effect-uncertain")).toHaveLength(0);

    for (const filename of [
      "20261019112300_v3_s14_transition_http409.sql",
      "20261019112900_v3_s13_migration_registration_context.sql",
      "20261019113300_v3_s13_strict_registration_restore.sql",
      "20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql",
    ]) {
      expect(classifications[filename]).toBe("effect-missing");
    }
    for (const filename of [
      "20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
      "20261021202000_v3_s14_archive_reconciliation_convergence.sql",
    ]) {
      expect(classifications[filename]).toBe("effect-partial");
    }
    expect(V3_PRODUCTION_SCHEMA_EFFECT_MATRIX.filter((entry) =>
      entry.evidenceRefs.some((ref) => ref.includes("catalog-20261108")),
    )).toHaveLength(6);
  });
});
