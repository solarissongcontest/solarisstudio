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

  it("promotes only the canonical Jury readiness projection after executable bounded proof exists", () => {
    const measured = V3_PROJECTION_LAG_METRIC_REGISTRY.filter(
      (item) => item.state === "measured",
    );
    expect(measured.map((item) => item.projection)).toEqual(["jury operational readiness"]);

    const jury = v3ProjectionLagMetric("jury operational readiness");
    expect(jury).toMatchObject({
      state: "measured",
      path: expect.stringContaining("studio2_measure_jury_operational_projection_lag"),
    });
    expect(jury?.measures).toContain("synchronous canonical read");
    expect(jury?.evidence).toContain(
      "supabase/migrations/20261019211100_v3_s6_jury_readiness_lag.sql",
    );

    expect(v3ProjectionLagMetric("jury ballot")?.state).toBe("missing");
    expect(v3ProjectionLagMetric("Organizer Jury")?.state).toBe("missing");
  });

  it("fails closed for unknown projection identities", () => {
    expect(v3ProjectionLagMetric("not-a-real-projection")).toBeNull();
  });
});
