import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  v3ProjectionReconciliation,
  type V3ProjectionReconciliation,
  type V3ProjectionRepairScope,
} from "./v3-projection-reconciliation-registry";

/**
 * System V3 S11 recovery guardrails.
 *
 * This module deliberately does not execute recovery. It turns the canonical S4
 * outbox and S6 reconciliation contracts into bounded, machine-checkable plans.
 * Callers must execute the declared server-side contract with the appropriate
 * privileged server context and then perform the declared verification step.
 *
 * Recovery is never allowed to mutate canonical domain truth directly.
 */

export const V3_MAX_RECOVERY_BATCH = 25;

export type V3RecoveryBlockReason =
  | "unknown_projection"
  | "canonical_rebuild_contract_missing"
  | "unbounded_global_recovery_forbidden"
  | "required_scope_missing"
  | "invalid_scope_id"
  | "batch_empty"
  | "batch_limit_exceeded"
  | "duplicate_scope"
  | "invalid_event_id"
  | "invalid_consumer_key";

export type V3RecoveryScope = {
  editionId?: string;
  showId?: string;
  actorId?: string;
  operationId?: string;
};

export type V3RecoveryPlan = {
  status: "ready" | "blocked";
  kind: "projection_rebuild" | "dead_letter_replay";
  target: string;
  scope: V3RecoveryScope | {
    eventId: string;
    consumerKey: string;
    resetAttempts: boolean;
  };
  canonicalPath: string | null;
  verificationPath: string | null;
  boundedBy: string;
  maxMutations: number;
  requiresServiceRole: boolean;
  mutatesCanonicalDomainState: false;
  failureState: string;
  evidence: readonly string[];
  blockedReason?: V3RecoveryBlockReason;
};

export type V3ProjectionRecoveryBatch = {
  status: "ready" | "blocked";
  projection: string;
  plans: readonly V3RecoveryPlan[];
  maxBatchSize: number;
  blockedReason?: V3RecoveryBlockReason;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONSUMER_KEY_RE = /^[a-z][a-z0-9_.:-]{0,159}$/;

function blockedProjectionPlan(
  projection: string,
  reason: V3RecoveryBlockReason,
  repair?: V3ProjectionReconciliation["repair"],
): V3RecoveryPlan {
  return {
    status: "blocked",
    kind: "projection_rebuild",
    target: projection,
    scope: {},
    canonicalPath: repair?.rebuildPath ?? null,
    verificationPath: repair?.verificationPath ?? null,
    boundedBy: repair?.boundedBy ?? "no canonical recovery bound declared",
    maxMutations: 0,
    requiresServiceRole: true,
    mutatesCanonicalDomainState: false,
    failureState: repair?.explicitFailureState ?? "reconciliation_required",
    evidence: repair?.evidence ?? [],
    blockedReason: reason,
  };
}

function requiredScopeKey(scope: V3ProjectionRepairScope): keyof V3RecoveryScope | null {
  switch (scope) {
    case "edition":
      return "editionId";
    case "show":
      return "showId";
    case "actor":
      return "actorId";
    case "operation":
      return "operationId";
    case "global":
      return null;
  }
}

function normalizedRecoveryScope(
  scope: Exclude<V3ProjectionRepairScope, "global">,
  value: string,
): V3RecoveryScope {
  switch (scope) {
    case "edition":
      return { editionId: value };
    case "show":
      return { showId: value };
    case "actor":
      return { actorId: value };
    case "operation":
      return { operationId: value };
  }
}

export function planV3ProjectionRecovery(
  projection: string,
  scope: V3RecoveryScope,
): V3RecoveryPlan {
  const contract = v3ProjectionReconciliation(projection);
  if (!contract) return blockedProjectionPlan(projection, "unknown_projection");

  const { repair } = contract;
  if (!["rebuildable", "verified"].includes(repair.state) || !repair.rebuildPath || !repair.verificationPath) {
    return blockedProjectionPlan(projection, "canonical_rebuild_contract_missing", repair);
  }

  if (repair.scope === "global") {
    return blockedProjectionPlan(projection, "unbounded_global_recovery_forbidden", repair);
  }

  const scopeKey = requiredScopeKey(repair.scope);
  if (!scopeKey || !scope[scopeKey]) {
    return blockedProjectionPlan(projection, "required_scope_missing", repair);
  }

  const scopeValue = scope[scopeKey];
  if (!scopeValue || !UUID_RE.test(scopeValue)) {
    return blockedProjectionPlan(projection, "invalid_scope_id", repair);
  }
  const boundedScope = normalizedRecoveryScope(repair.scope, scopeValue);

  return {
    status: "ready",
    kind: "projection_rebuild",
    target: projection,
    scope: boundedScope,
    canonicalPath: repair.rebuildPath,
    verificationPath: repair.verificationPath,
    boundedBy: repair.boundedBy ?? `one ${repair.scope} per recovery invocation`,
    maxMutations: 1,
    requiresServiceRole: true,
    mutatesCanonicalDomainState: false,
    failureState: repair.explicitFailureState,
    evidence: repair.evidence,
  };
}

export function planV3ProjectionRecoveryBatch(
  projection: string,
  scopes: readonly V3RecoveryScope[],
): V3ProjectionRecoveryBatch {
  if (scopes.length === 0) {
    return {
      status: "blocked",
      projection,
      plans: [],
      maxBatchSize: V3_MAX_RECOVERY_BATCH,
      blockedReason: "batch_empty",
    };
  }
  if (scopes.length > V3_MAX_RECOVERY_BATCH) {
    return {
      status: "blocked",
      projection,
      plans: [],
      maxBatchSize: V3_MAX_RECOVERY_BATCH,
      blockedReason: "batch_limit_exceeded",
    };
  }

  const plans = scopes.map((scope) => planV3ProjectionRecovery(projection, scope));
  const blocked = plans.find((plan) => plan.status === "blocked");
  if (blocked) {
    return {
      status: "blocked",
      projection,
      plans,
      maxBatchSize: V3_MAX_RECOVERY_BATCH,
      blockedReason: blocked.blockedReason,
    };
  }

  const scopeIdentities = plans.map((plan) => JSON.stringify(plan.scope));
  if (new Set(scopeIdentities).size !== scopeIdentities.length) {
    return {
      status: "blocked",
      projection,
      plans,
      maxBatchSize: V3_MAX_RECOVERY_BATCH,
      blockedReason: "duplicate_scope",
    };
  }

  return {
    status: "ready",
    projection,
    plans,
    maxBatchSize: V3_MAX_RECOVERY_BATCH,
  };
}

export function planV3DeadLetterReplay(input: {
  eventId: string;
  consumerKey: string;
  resetAttempts?: boolean;
}): V3RecoveryPlan {
  const resetAttempts = input.resetAttempts ?? false;
  const scope = {
    eventId: input.eventId,
    consumerKey: input.consumerKey,
    resetAttempts,
  };

  if (!UUID_RE.test(input.eventId)) {
    return {
      status: "blocked",
      kind: "dead_letter_replay",
      target: `${input.eventId}:${input.consumerKey}`,
      scope,
      canonicalPath: null,
      verificationPath: null,
      boundedBy: "one event + consumer delivery per invocation",
      maxMutations: 0,
      requiresServiceRole: true,
      mutatesCanonicalDomainState: false,
      failureState: "operator_required_recovery",
      evidence: [],
      blockedReason: "invalid_event_id",
    };
  }

  if (!CONSUMER_KEY_RE.test(input.consumerKey)) {
    return {
      status: "blocked",
      kind: "dead_letter_replay",
      target: `${input.eventId}:${input.consumerKey}`,
      scope,
      canonicalPath: null,
      verificationPath: null,
      boundedBy: "one event + consumer delivery per invocation",
      maxMutations: 0,
      requiresServiceRole: true,
      mutatesCanonicalDomainState: false,
      failureState: "operator_required_recovery",
      evidence: [],
      blockedReason: "invalid_consumer_key",
    };
  }

  return {
    status: "ready",
    kind: "dead_letter_replay",
    target: `${input.eventId}:${input.consumerKey}`,
    scope,
    canonicalPath: "public.studio2_requeue_dead_letter_domain_event(event_id, consumer_key, reset_attempts)",
    verificationPath:
      "Verify the exact outbox delivery returns to pending, is subsequently claimed once, and gains exactly one immutable consumer receipt after successful processing.",
    boundedBy: "one event + consumer delivery per invocation",
    maxMutations: 1,
    requiresServiceRole: true,
    mutatesCanonicalDomainState: false,
    failureState: "operator_required_recovery",
    evidence: [
      "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
    ],
  };
}

export type V3RecoveryReadinessReport = {
  schemaVersion: 1;
  maxBatchSize: number;
  rebuildableProjectionCount: number;
  blockedProjectionCount: number;
  rebuildableProjections: readonly {
    projection: string;
    scope: V3ProjectionRepairScope;
    rebuildPath: string;
    verificationPath: string;
    boundedBy: string;
  }[];
  blockedProjections: readonly {
    projection: string;
    repairState: V3ProjectionReconciliation["repair"]["state"];
    scope: V3ProjectionRepairScope;
    reason: "canonical_rebuild_contract_missing" | "unbounded_global_recovery_forbidden";
  }[];
  deadLetterReplay: {
    canonicalPath: string;
    boundedBy: string;
    resetAttemptsDefault: false;
  };
};

export function buildV3RecoveryReadinessReport(): V3RecoveryReadinessReport {
  const rebuildableProjections: V3RecoveryReadinessReport["rebuildableProjections"][number][] = [];
  const blockedProjections: V3RecoveryReadinessReport["blockedProjections"][number][] = [];

  for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
    const { repair } = projection;
    if (
      ["rebuildable", "verified"].includes(repair.state)
      && repair.scope !== "global"
      && repair.rebuildPath
      && repair.verificationPath
      && repair.boundedBy
    ) {
      rebuildableProjections.push({
        projection: projection.projection,
        scope: repair.scope,
        rebuildPath: repair.rebuildPath,
        verificationPath: repair.verificationPath,
        boundedBy: repair.boundedBy,
      });
      continue;
    }

    blockedProjections.push({
      projection: projection.projection,
      repairState: repair.state,
      scope: repair.scope,
      reason:
        repair.scope === "global" && ["rebuildable", "verified"].includes(repair.state)
          ? "unbounded_global_recovery_forbidden"
          : "canonical_rebuild_contract_missing",
    });
  }

  return {
    schemaVersion: 1,
    maxBatchSize: V3_MAX_RECOVERY_BATCH,
    rebuildableProjectionCount: rebuildableProjections.length,
    blockedProjectionCount: blockedProjections.length,
    rebuildableProjections,
    blockedProjections,
    deadLetterReplay: {
      canonicalPath: "public.studio2_requeue_dead_letter_domain_event(event_id, consumer_key, reset_attempts)",
      boundedBy: "one event + consumer delivery per invocation",
      resetAttemptsDefault: false,
    },
  };
}
