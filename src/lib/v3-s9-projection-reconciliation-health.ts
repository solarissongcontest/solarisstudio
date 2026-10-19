import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  type V3ProjectionFreshnessClass,
  type V3ProjectionRepairState,
} from "./v3-projection-reconciliation-registry";

export type V3ProjectionReconciliationHealth = {
  total: number;
  states: Record<V3ProjectionRepairState, number>;
  freshness: Record<V3ProjectionFreshnessClass, number>;
  repairReady: number;
  unresolved: Array<{
    projection: string;
    state: V3ProjectionRepairState;
    freshnessClass: V3ProjectionFreshnessClass;
    canonicalDomains: readonly string[];
    scope: string;
    failureState: string;
    missing: readonly string[];
  }>;
};

/**
 * System V3 S9 visibility over the canonical S6 registry.
 *
 * This is deliberately a contract/status projection, not a runtime freshness
 * guess. It reports exactly which projections have proven bounded rebuild and
 * verification paths and which still require reconciliation implementation.
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

  const unresolved: V3ProjectionReconciliationHealth["unresolved"] = [];

  for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
    states[projection.repair.state] += 1;
    freshness[projection.freshnessClass] += 1;

    if (!["rebuildable", "verified"].includes(projection.repair.state)) {
      const missing: string[] = [];
      if (!projection.repair.rebuildPath) missing.push("rebuildPath");
      if (!projection.repair.verificationPath) missing.push("verificationPath");
      if (!projection.repair.boundedBy) missing.push("boundedBy");
      if (projection.repair.evidence.length === 0) missing.push("evidence");

      unresolved.push({
        projection: projection.projection,
        state: projection.repair.state,
        freshnessClass: projection.freshnessClass,
        canonicalDomains: projection.canonicalDomains,
        scope: projection.repair.scope,
        failureState: projection.repair.explicitFailureState,
        missing,
      });
    }
  }

  unresolved.sort((left, right) => left.projection.localeCompare(right.projection));

  return {
    total: V3_PROJECTION_RECONCILIATION_REGISTRY.length,
    states,
    freshness,
    repairReady: states.rebuildable + states.verified,
    unresolved,
  };
}
