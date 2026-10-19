import { describe, expect, it } from "vitest";
import { V3_PROJECTION_LAG_METRIC_REGISTRY } from "./v3-projection-lag-metric-registry";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import { v3ProjectionReconciliationHealth } from "./v3-s9-projection-reconciliation-health";

describe("System V3 S9 projection reconciliation health", () => {
  it("counts every canonical S6 projection exactly once", () => {
    const health = v3ProjectionReconciliationHealth();
    expect(health.total).toBe(V3_PROJECTION_RECONCILIATION_REGISTRY.length);
    expect(Object.values(health.states).reduce((sum, count) => sum + count, 0)).toBe(health.total);
    expect(Object.values(health.freshness).reduce((sum, count) => sum + count, 0)).toBe(health.total);
    expect(Object.values(health.lagMetrics).reduce((sum, count) => sum + count, 0)).toBe(health.total);
    expect(health.repairReady).toBe(health.states.rebuildable + health.states.verified);
    expect(health.missingLagMetric).toBe(health.lagMetrics.missing);
  });

  it("separates repair readiness from complete S6 evidence", () => {
    const health = v3ProjectionReconciliationHealth();
    const measured = new Set(
      V3_PROJECTION_LAG_METRIC_REGISTRY
        .filter((item) => item.state === "measured")
        .map((item) => item.projection),
    );
    const expectedComplete = V3_PROJECTION_RECONCILIATION_REGISTRY.filter(
      (projection) =>
        ["rebuildable", "verified"].includes(projection.repair.state) &&
        measured.has(projection.projection),
    ).length;

    expect(health.s6Complete).toBe(expectedComplete);
    expect(health.s6Complete).toBeLessThanOrEqual(health.repairReady);
  });

  it("exposes unresolved repair and lag contract gaps without guessing runtime freshness", () => {
    const health = v3ProjectionReconciliationHealth();
    const unresolvedByName = new Map(health.unresolved.map((item) => [item.projection, item] as const));
    const lagByName = new Map(
      V3_PROJECTION_LAG_METRIC_REGISTRY.map((item) => [item.projection, item] as const),
    );

    for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
      const repairReady = ["rebuildable", "verified"].includes(projection.repair.state);
      const lagReady = lagByName.get(projection.projection)?.state === "measured";
      expect(unresolvedByName.has(projection.projection)).toBe(!(repairReady && lagReady));
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
      expect(["declared", "foundation", "rebuildable", "verified"]).toContain(item.state);
      expect(item.missing.every((field) =>
        ["rebuildPath", "verificationPath", "boundedBy", "evidence", "lagMetric"].includes(field),
      )).toBe(true);
      if (item.missing.includes("lagMetric")) {
        expect(item.lagMetricState).toBe("missing");
        expect(item.lagMetricPath).toBeNull();
      }
    }
  });
});
