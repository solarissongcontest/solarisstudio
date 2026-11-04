import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  type V3ProjectionFreshnessClass,
  type V3ProjectionRepairState,
} from "./v3-projection-reconciliation-registry";
import {
  V3_PROJECTION_LAG_METRIC_REGISTRY,
  type V3ProjectionLagMetricState,
} from "./v3-projection-lag-metric-registry";

export type V3ProjectionReconciliationHealth = {
  total: number;
  states: Record<V3ProjectionRepairState, number>;
  freshness: Record<V3ProjectionFreshnessClass, number>;
  lagMetrics: Record<V3ProjectionLagMetricState, number>;
  repairReady: number;
  s6Complete: number;
  missingLagMetric: number;
  unresolved: Array<{
    projection: string;
    state: V3ProjectionRepairState;
    freshnessClass: V3ProjectionFreshnessClass;
    canonicalDomains: readonly string[];
    scope: string;
    failureState: string;
    lagMetricState: V3ProjectionLagMetricState;
    lagMetricPath: string | null;
    missing: readonly string[];
  }>;
};

/**
 * System V3 S9 visibility over the canonical S6 registry.
 *
 * `repairReady` intentionally preserves the established meaning: a projection
 * has bounded rebuild + independent verification evidence. `s6Complete` is the
 * stricter release signal and additionally requires an executable lag metric.
 * This keeps existing repair work honest while exposing the S6 lag backlog
 * rather than pretending rebuildability also proves freshness observability.
 */
export function v3ProjectionReconciliationHealth(): V3ProjectionReconciliationHealth {
  const states: Record<V3ProjectionRepairState, number> = {
    declared: 0,
    foundation: 0,
    rebuildable: 0,
    verified: 0,
  };
  const freshness: Record<V3ProjectionFreshnessClass, number> = {
    static: 0,
    normal: 0,
    operational: 0,
    live: 0,
  };
  const lagMetrics: Record<V3ProjectionLagMetricState, number> = {
    missing: 0,
    measured: 0,
  };
  const lagByProjection = new Map(
    V3_PROJECTION_LAG_METRIC_REGISTRY.map((metric) => [metric.projection, metric] as const),
  );
  const unresolved: V3ProjectionReconciliationHealth["unresolved"] = [];
  let s6Complete = 0;

  for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
    states[projection.repair.state] += 1;
    freshness[projection.freshnessClass] += 1;

    const lagMetric = lagByProjection.get(projection.projection);
    const lagMetricState = lagMetric?.state ?? "missing";
    lagMetrics[lagMetricState] += 1;

    const repairReady = ["rebuildable", "verified"].includes(projection.repair.state);
    const complete = repairReady && lagMetricState === "measured";
    if (complete) s6Complete += 1;

    if (!complete) {
      const missing: string[] = [];
      if (!projection.repair.rebuildPath) missing.push("rebuildPath");
      if (!projection.repair.verificationPath) missing.push("verificationPath");
      if (!projection.repair.boundedBy) missing.push("boundedBy");
      if (projection.repair.evidence.length === 0) missing.push("evidence");
      if (lagMetricState !== "measured") missing.push("lagMetric");

      unresolved.push({
        projection: projection.projection,
        state: projection.repair.state,
        freshnessClass: projection.freshnessClass,
        canonicalDomains: projection.canonicalDomains,
        scope: projection.repair.scope,
        failureState: projection.repair.explicitFailureState,
        lagMetricState,
        lagMetricPath: lagMetric?.path ?? null,
        missing,
      });
    }
  }

  unresolved.sort((left, right) => left.projection.localeCompare(right.projection));

  return {
    total: V3_PROJECTION_RECONCILIATION_REGISTRY.length,
    states,
    freshness,
    lagMetrics,
    repairReady: states.rebuildable + states.verified,
    s6Complete,
    missingLagMetric: lagMetrics.missing,
    unresolved,
  };
}
