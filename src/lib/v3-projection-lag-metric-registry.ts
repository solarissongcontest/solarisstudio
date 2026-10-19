import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

export type V3ProjectionLagMetricState = "missing" | "measured";

export type V3ProjectionLagMetricContract = {
  projection: string;
  state: V3ProjectionLagMetricState;
  path: string | null;
  measures: string | null;
  evidence: readonly string[];
};

const ENTRY_LAG_METRIC: Omit<V3ProjectionLagMetricContract, "projection"> = {
  state: "measured",
  path: "measureConfirmationEntryProjectionLagInternal(editionId).oldestDriftAgeSeconds",
  measures:
    "Oldest age in seconds of independently verified Confirmation-owned Entry/Participant projection drift for one edition; consistent=0 and unmeasurable/unknown=null.",
  evidence: [
    "src/integrations/confirmations/reconciliation-lag.server.ts",
    "src/lib/v3-s6-entry-projection-lag.test.ts",
    "src/integrations/confirmations/reconcile.server.ts",
  ],
};

/**
 * Executable S6 lag metrics only.
 *
 * Do not add aspirational metric names here. A projection is `measured` only
 * after the referenced path returns a bounded, reviewable lag signal and the
 * evidence proves that behavior. The default is deliberately `missing` so the
 * S9 System Health projection exposes incomplete S6 coverage instead of
 * manufacturing a green status from repair metadata alone.
 */
function metricForProjection(
  projection: (typeof V3_PROJECTION_RECONCILIATION_REGISTRY)[number],
): Omit<V3ProjectionLagMetricContract, "projection"> | null {
  if (
    projection.canonicalDomains.length === 1 &&
    projection.canonicalDomains[0] === "entry"
  ) {
    return ENTRY_LAG_METRIC;
  }
  return null;
}

export const V3_PROJECTION_LAG_METRIC_REGISTRY: readonly V3ProjectionLagMetricContract[] =
  V3_PROJECTION_RECONCILIATION_REGISTRY.map((projection) => {
    const metric = metricForProjection(projection);
    return metric
      ? { projection: projection.projection, ...metric }
      : {
          projection: projection.projection,
          state: "missing" as const,
          path: null,
          measures: null,
          evidence: [],
        };
  }).sort((left, right) => left.projection.localeCompare(right.projection));

export function v3ProjectionLagMetric(projection: string) {
  return V3_PROJECTION_LAG_METRIC_REGISTRY.find((item) => item.projection === projection) ?? null;
}

export function validateV3ProjectionLagMetricRegistry() {
  const errors: string[] = [];
  const expected = new Set(V3_PROJECTION_RECONCILIATION_REGISTRY.map((item) => item.projection));
  const seen = new Set<string>();

  for (const metric of V3_PROJECTION_LAG_METRIC_REGISTRY) {
    if (seen.has(metric.projection)) errors.push(`duplicate lag metric ${metric.projection}`);
    seen.add(metric.projection);
    if (!expected.has(metric.projection)) errors.push(`orphan lag metric ${metric.projection}`);

    if (metric.state === "measured") {
      if (!metric.path) errors.push(`${metric.projection} claims measured lag without a path`);
      if (!metric.measures) errors.push(`${metric.projection} claims measured lag without semantics`);
      if (!metric.evidence.length) errors.push(`${metric.projection} claims measured lag without evidence`);
    } else if (metric.path || metric.measures || metric.evidence.length) {
      errors.push(`${metric.projection} has lag metadata without executable measured state`);
    }
  }

  for (const projection of expected) {
    if (!seen.has(projection)) errors.push(`unregistered lag metric ${projection}`);
  }

  return errors;
}
