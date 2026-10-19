import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

export type V3ProjectionLagMetricState = "missing" | "measured";

export type V3ProjectionLagMetricContract = {
  projection: string;
  state: V3ProjectionLagMetricState;
  path: string | null;
  measures: string | null;
  evidence: readonly string[];
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
const EXECUTABLE_LAG_METRICS: Readonly<
  Record<string, Omit<V3ProjectionLagMetricContract, "projection">>
> = {};

export const V3_PROJECTION_LAG_METRIC_REGISTRY: readonly V3ProjectionLagMetricContract[] =
  V3_PROJECTION_RECONCILIATION_REGISTRY.map((projection) => {
    const metric = EXECUTABLE_LAG_METRICS[projection.projection];
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
