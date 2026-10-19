import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import { v3ProjectionReconciliationHealth } from "./v3-s9-projection-reconciliation-health";

describe("System V3 S9 projection reconciliation health", () => {
  it("counts every canonical S6 projection exactly once", () => {
    const health = v3ProjectionReconciliationHealth();
    expect(health.total).toBe(V3_PROJECTION_RECONCILIATION_REGISTRY.length);
    expect(Object.values(health.states).reduce((sum, count) => sum + count, 0)).toBe(health.total);
    expect(Object.values(health.freshness).reduce((sum, count) => sum + count, 0)).toBe(health.total);
    expect(health.repairReady).toBe(health.states.rebuildable + health.states.verified);
  });

  it("exposes only unresolved contract gaps rather than guessing runtime freshness", () => {
    const health = v3ProjectionReconciliationHealth();
    const unresolvedNames = new Set(health.unresolved.map((item) => item.projection));

    for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
      const shouldBeUnresolved = !["rebuildable", "verified"].includes(projection.repair.state);
      expect(unresolvedNames.has(projection.projection)).toBe(shouldBeUnresolved);
    }

    expect(health.unresolved.every((item) => item.failureState.length > 0)).toBe(true);
    expect(health.unresolved.every((item) => item.missing.length > 0)).toBe(true);
  });

  it("keeps unresolved entries deterministic and actionable", () => {
    const health = v3ProjectionReconciliationHealth();
    const names = health.unresolved.map((item) => item.projection);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));

    for (const item of health.unresolved) {
      expect(item.canonicalDomains.length).toBeGreaterThan(0);
      expect(["declared", "foundation"]).toContain(item.state);
      expect(item.missing.every((field) =>
        ["rebuildPath", "verificationPath", "boundedBy", "evidence"].includes(field),
      )).toBe(true);
    }
  });
});
