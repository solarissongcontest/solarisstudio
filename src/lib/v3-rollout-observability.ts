export type V3RolloutStage = 'shadow' | 'limited' | 'full';
export type V3RolloutEvidenceTarget = 'limited' | 'full' | 'retire_legacy';

export type V3ObservabilitySurface =
  | 'home'
  | 'explore'
  | 'participate'
  | 'results'
  | 'me'
  | 'organizer';

export type V3ObservabilityWorkflow =
  | 'confirmation'
  | 'entry'
  | 'media'
  | 'jury'
  | 'televote'
  | 'organizer';

export type V3ObservabilityEventName =
  | 'v3_exposure'
  | 'v3_bootstrap_outcome'
  | 'v3_surface_opened'
  | 'v3_workflow_outcome'
  | 'v3_reconciliation_outcome'
  | 'v3_legacy_fallback'
  | 'v3_runtime_error'
  | 'v3_client_update_state';

export type V3ObservabilityOutcome =
  | 'ready'
  | 'failed'
  | 'confirmed'
  | 'rejected'
  | 'uncertain'
  | 'reconciled'
  | 'conflict'
  | 'fallback'
  | 'deferred'
  | 'applied';

export type V3ObservabilityReasonCode =
  | 'canonical_read_failed'
  | 'context_mismatch'
  | 'authorization_changed'
  | 'network_unavailable'
  | 'cross_device_conflict'
  | 'uncertain_submission'
  | 'legacy_required'
  | 'unsafe_update_boundary'
  | 'unknown_safe';

export type V3ObservabilityEvent = {
  name: V3ObservabilityEventName;
  stage: V3RolloutStage;
  serverObservedAt: string;
  surface?: V3ObservabilitySurface;
  workflow?: V3ObservabilityWorkflow;
  outcome?: V3ObservabilityOutcome;
  reasonCode?: V3ObservabilityReasonCode;
  device?: 'mobile' | 'tablet' | 'desktop';
};

export type V3ObservabilityAggregate = {
  exposedSessions: number;
  bootstrapAttempts: number;
  bootstrapFailures: number;
  runtimeErrors: number;
  legacyFallbacks: number;
  criticalOperationAttempts: number;
  criticalOperationConfirmed: number;
  criticalOperationRejected: number;
  criticalOperationUncertain: number;
  unresolvedUncertainOperations: number;
  reconciliationAttempts: number;
  reconciliationResolved: number;
  fieldVitalSamples: number;
  poorFieldVitalSamples: number;
};

export type V3ObservabilityThresholds = {
  minExposedSessions: number;
  minBootstrapAttempts: number;
  minCriticalOperationSamples: number;
  minFieldVitalSamples: number;
  maxBootstrapFailureRate: number;
  maxRuntimeErrorsPerSession: number;
  maxLegacyFallbackRate: number;
  maxPoorFieldVitalRate: number;
};

export type V3ObservabilityGate = {
  id: string;
  passed: boolean;
  actual: number;
  required: string;
};

export type V3ObservabilityEvaluation = {
  target: V3RolloutEvidenceTarget;
  ready: boolean;
  gates: readonly V3ObservabilityGate[];
  blockers: readonly V3ObservabilityGate[];
};

function validTimestamp(value: string): string {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error('V3 observability requires a server-observed timestamp.');
  }
  return normalized;
}

export function createV3ObservabilityEvent(input: V3ObservabilityEvent): V3ObservabilityEvent {
  return Object.freeze({
    ...input,
    serverObservedAt: validTimestamp(input.serverObservedAt),
  });
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

function thresholdRate(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
  return value;
}

function countGate(id: string, actual: number, minimum: number): V3ObservabilityGate {
  return {
    id,
    passed: actual >= minimum,
    actual,
    required: `>= ${minimum}`,
  };
}

function maxGate(id: string, actual: number, maximum: number): V3ObservabilityGate {
  return {
    id,
    passed: Number.isFinite(actual) && actual <= maximum,
    actual,
    required: `<= ${maximum}`,
  };
}

export function evaluateV3RolloutObservability(
  target: V3RolloutEvidenceTarget,
  aggregateInput: V3ObservabilityAggregate,
  thresholdsInput: V3ObservabilityThresholds,
): V3ObservabilityEvaluation {
  const aggregate: V3ObservabilityAggregate = {
    exposedSessions: nonNegativeInteger(aggregateInput.exposedSessions, 'exposedSessions'),
    bootstrapAttempts: nonNegativeInteger(aggregateInput.bootstrapAttempts, 'bootstrapAttempts'),
    bootstrapFailures: nonNegativeInteger(aggregateInput.bootstrapFailures, 'bootstrapFailures'),
    runtimeErrors: nonNegativeInteger(aggregateInput.runtimeErrors, 'runtimeErrors'),
    legacyFallbacks: nonNegativeInteger(aggregateInput.legacyFallbacks, 'legacyFallbacks'),
    criticalOperationAttempts: nonNegativeInteger(
      aggregateInput.criticalOperationAttempts,
      'criticalOperationAttempts',
    ),
    criticalOperationConfirmed: nonNegativeInteger(
      aggregateInput.criticalOperationConfirmed,
      'criticalOperationConfirmed',
    ),
    criticalOperationRejected: nonNegativeInteger(
      aggregateInput.criticalOperationRejected,
      'criticalOperationRejected',
    ),
    criticalOperationUncertain: nonNegativeInteger(
      aggregateInput.criticalOperationUncertain,
      'criticalOperationUncertain',
    ),
    unresolvedUncertainOperations: nonNegativeInteger(
      aggregateInput.unresolvedUncertainOperations,
      'unresolvedUncertainOperations',
    ),
    reconciliationAttempts: nonNegativeInteger(
      aggregateInput.reconciliationAttempts,
      'reconciliationAttempts',
    ),
    reconciliationResolved: nonNegativeInteger(
      aggregateInput.reconciliationResolved,
      'reconciliationResolved',
    ),
    fieldVitalSamples: nonNegativeInteger(aggregateInput.fieldVitalSamples, 'fieldVitalSamples'),
    poorFieldVitalSamples: nonNegativeInteger(
      aggregateInput.poorFieldVitalSamples,
      'poorFieldVitalSamples',
    ),
  };

  const thresholds = {
    minExposedSessions: nonNegativeInteger(thresholdsInput.minExposedSessions, 'minExposedSessions'),
    minBootstrapAttempts: nonNegativeInteger(
      thresholdsInput.minBootstrapAttempts,
      'minBootstrapAttempts',
    ),
    minCriticalOperationSamples: nonNegativeInteger(
      thresholdsInput.minCriticalOperationSamples,
      'minCriticalOperationSamples',
    ),
    minFieldVitalSamples: nonNegativeInteger(
      thresholdsInput.minFieldVitalSamples,
      'minFieldVitalSamples',
    ),
    maxBootstrapFailureRate: thresholdRate(
      thresholdsInput.maxBootstrapFailureRate,
      'maxBootstrapFailureRate',
    ),
    maxRuntimeErrorsPerSession: thresholdRate(
      thresholdsInput.maxRuntimeErrorsPerSession,
      'maxRuntimeErrorsPerSession',
    ),
    maxLegacyFallbackRate: thresholdRate(
      thresholdsInput.maxLegacyFallbackRate,
      'maxLegacyFallbackRate',
    ),
    maxPoorFieldVitalRate: thresholdRate(
      thresholdsInput.maxPoorFieldVitalRate,
      'maxPoorFieldVitalRate',
    ),
  };

  if (aggregate.bootstrapFailures > aggregate.bootstrapAttempts) {
    throw new Error('bootstrapFailures cannot exceed bootstrapAttempts.');
  }
  if (aggregate.poorFieldVitalSamples > aggregate.fieldVitalSamples) {
    throw new Error('poorFieldVitalSamples cannot exceed fieldVitalSamples.');
  }
  if (aggregate.unresolvedUncertainOperations > aggregate.criticalOperationUncertain) {
    throw new Error('unresolvedUncertainOperations cannot exceed criticalOperationUncertain.');
  }
  if (aggregate.reconciliationResolved > aggregate.reconciliationAttempts) {
    throw new Error('reconciliationResolved cannot exceed reconciliationAttempts.');
  }

  const gates: V3ObservabilityGate[] = [
    countGate('exposed-sessions', aggregate.exposedSessions, thresholds.minExposedSessions),
    countGate('bootstrap-samples', aggregate.bootstrapAttempts, thresholds.minBootstrapAttempts),
    countGate('field-vital-samples', aggregate.fieldVitalSamples, thresholds.minFieldVitalSamples),
    maxGate(
      'bootstrap-failure-rate',
      rate(aggregate.bootstrapFailures, aggregate.bootstrapAttempts),
      thresholds.maxBootstrapFailureRate,
    ),
    maxGate(
      'runtime-errors-per-session',
      rate(aggregate.runtimeErrors, aggregate.exposedSessions),
      thresholds.maxRuntimeErrorsPerSession,
    ),
    maxGate(
      'legacy-fallback-rate',
      rate(aggregate.legacyFallbacks, aggregate.exposedSessions),
      thresholds.maxLegacyFallbackRate,
    ),
    maxGate(
      'poor-field-vital-rate',
      rate(aggregate.poorFieldVitalSamples, aggregate.fieldVitalSamples),
      thresholds.maxPoorFieldVitalRate,
    ),
  ];

  if (target === 'full' || target === 'retire_legacy') {
    gates.push(
      countGate(
        'critical-operation-samples',
        aggregate.criticalOperationAttempts,
        thresholds.minCriticalOperationSamples,
      ),
      {
        id: 'no-unresolved-uncertain-operations',
        passed: aggregate.unresolvedUncertainOperations === 0,
        actual: aggregate.unresolvedUncertainOperations,
        required: '= 0',
      },
    );

    if (aggregate.criticalOperationUncertain > 0) {
      gates.push({
        id: 'uncertain-operation-reconciliation',
        passed:
          aggregate.reconciliationAttempts >= aggregate.criticalOperationUncertain &&
          aggregate.reconciliationResolved >= aggregate.criticalOperationUncertain,
        actual: aggregate.reconciliationResolved,
        required: `>= ${aggregate.criticalOperationUncertain} resolved`,
      });
    }
  }

  if (target === 'retire_legacy') {
    gates.push({
      id: 'zero-observed-legacy-fallbacks',
      passed: aggregate.legacyFallbacks === 0,
      actual: aggregate.legacyFallbacks,
      required: '= 0',
    });
  }

  const blockers = gates.filter((gate) => !gate.passed);
  return {
    target,
    ready: blockers.length === 0,
    gates,
    blockers,
  };
}

/**
 * V3 telemetry must remain aggregate and low-cardinality. Event metadata above
 * intentionally contains no user ID, delegation/country ID, edition ID, song,
 * artist, search text, arbitrary error message or free-form payload.
 * Existing Public UX / field-vitals transport can carry these intents later.
 */
export const V3_OBSERVABILITY_PRIVACY_CONTRACT = Object.freeze({
  allowsRawUserIdentifiers: false,
  allowsRawContestContent: false,
  allowsRawErrorMessages: false,
  lowCardinalityOnly: true,
});
