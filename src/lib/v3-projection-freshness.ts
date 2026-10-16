import {
  v3ProjectionReconciliation,
  type V3ProjectionRepairContract,
} from "./v3-projection-reconciliation-registry";

export type V3ProjectionObservation = {
  projection: string;
  stateVersion: string | number | null;
  generatedAt: string;
  serverTime: string;
};

export type V3ProjectionAuthorityEvidence = {
  authoritativeStateVersion?: string | number | null;
  latestInvalidatingEventAt?: string | null;
};

export type V3ProjectionFreshnessResult = {
  state: "fresh" | "stale" | "unknown";
  reason:
    | "matches_authoritative_state"
    | "state_version_changed"
    | "invalidating_event_after_generation"
    | "no_authoritative_comparison"
    | "invalid_metadata"
    | "unknown_projection";
  recovery: "none" | "rebuild" | "reconciliation_required";
  repair: V3ProjectionRepairContract | null;
};

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function version(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function recoveryFor(repair: V3ProjectionRepairContract): V3ProjectionFreshnessResult["recovery"] {
  return ["rebuildable", "verified"].includes(repair.state)
    ? "rebuild"
    : "reconciliation_required";
}

/**
 * Evaluate freshness only from authoritative version/event evidence.
 *
 * Deliberately absent: Date.now(), cache-age guesses, browser clock authority,
 * or freshness thresholds invented by the client. If no authoritative comparison
 * exists, the result stays unknown instead of being promoted to fresh by elapsed time.
 */
export function assessV3ProjectionFreshness(
  observation: V3ProjectionObservation,
  authority: V3ProjectionAuthorityEvidence,
): V3ProjectionFreshnessResult {
  const projection = v3ProjectionReconciliation(observation.projection);
  if (!projection) {
    return {
      state: "unknown",
      reason: "unknown_projection",
      recovery: "reconciliation_required",
      repair: null,
    };
  }

  const generatedAt = timestamp(observation.generatedAt);
  const serverTime = timestamp(observation.serverTime);
  const latestInvalidatingEventAt = timestamp(authority.latestInvalidatingEventAt);
  const observedVersion = version(observation.stateVersion);
  const authoritativeVersion = version(authority.authoritativeStateVersion);

  if (
    generatedAt === null ||
    serverTime === null ||
    generatedAt > serverTime ||
    (authority.latestInvalidatingEventAt != null && latestInvalidatingEventAt === null)
  ) {
    return {
      state: "unknown",
      reason: "invalid_metadata",
      recovery: "reconciliation_required",
      repair: projection.repair,
    };
  }

  if (authoritativeVersion !== null) {
    if (observedVersion === null || observedVersion !== authoritativeVersion) {
      return {
        state: "stale",
        reason: "state_version_changed",
        recovery: recoveryFor(projection.repair),
        repair: projection.repair,
      };
    }
  }

  if (latestInvalidatingEventAt !== null && latestInvalidatingEventAt > generatedAt) {
    return {
      state: "stale",
      reason: "invalidating_event_after_generation",
      recovery: recoveryFor(projection.repair),
      repair: projection.repair,
    };
  }

  if (authoritativeVersion === null && latestInvalidatingEventAt === null) {
    return {
      state: "unknown",
      reason: "no_authoritative_comparison",
      recovery: "reconciliation_required",
      repair: projection.repair,
    };
  }

  return {
    state: "fresh",
    reason: "matches_authoritative_state",
    recovery: "none",
    repair: projection.repair,
  };
}
