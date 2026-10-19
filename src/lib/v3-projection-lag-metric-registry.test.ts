import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import {
  V3_PROJECTION_LAG_METRIC_REGISTRY,
  v3ProjectionLagMetric,
  validateV3ProjectionLagMetricRegistry,
} from "./v3-projection-lag-metric-registry";

describe("System V3 S6 projection lag metric registry", () => {
  it("covers every canonical reconciliation projection exactly once", () => {
    const expected = V3_PROJECTION_RECONCILIATION_REGISTRY.map((item) => item.projection).sort();
    const actual = V3_PROJECTION_LAG_METRIC_REGISTRY.map((item) => item.projection).sort();
    expect(actual).toEqual(expected);
    expect(validateV3ProjectionLagMetricRegistry()).toEqual([]);
  });

  it("fails closed to missing until a metric has an executable path and evidence", () => {
    expect(V3_PROJECTION_LAG_METRIC_REGISTRY.length).toBeGreaterThan(0);
    expect(V3_PROJECTION_LAG_METRIC_REGISTRY.some((item) => item.state === "missing")).toBe(true);

    for (const metric of V3_PROJECTION_LAG_METRIC_REGISTRY) {
      if (metric.state === "measured") {
        expect(metric.path).toBeTruthy();
        expect(metric.measures).toBeTruthy();
        expect(metric.evidence.length).toBeGreaterThan(0);
      } else {
        expect(metric.path).toBeNull();
        expect(metric.measures).toBeNull();
        expect(metric.evidence).toEqual([]);
      }
    }
  });

  it("fails closed for unknown projection identities", () => {
    expect(v3ProjectionLagMetric("not-a-real-projection")).toBeNull();
  });
});
