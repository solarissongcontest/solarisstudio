import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

// This slice deliberately improves bounded repair evidence without promoting the
// full Notification projection. Missing-candidate reconstruction still needs a
// provider-complete canonical rebuild contract before `rebuildable` is honest.
describe("System V3 S6 Notification registry status", () => {
  it("keeps Notification at foundation until provider-complete reconstruction exists", () => {
    const projections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("notification"),
    );

    expect(projections.length).toBeGreaterThan(0);
    for (const projection of projections) {
      expect(projection.repair.state).toBe("foundation");
      expect(projection.repair.scope).toBe("actor");
      expect(projection.repair.rebuildPath).toBeNull();
      expect(projection.repair.explicitFailureState).toBe("delivery_reconciliation_required");
    }
  });
});
