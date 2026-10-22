import { describe, expect, it } from 'vitest';
import {
  createV3ObservabilityEvent,
  evaluateV3RolloutObservability,
  type V3ObservabilityAggregate,
  type V3ObservabilityThresholds,
} from './v3-rollout-observability';

const thresholds: V3ObservabilityThresholds = {
  minExposedSessions: 20,
  minBootstrapAttempts: 20,
  minCriticalOperationSamples: 10,
  minFieldVitalSamples: 30,
  maxBootstrapFailureRate: 0.02,
  maxRuntimeErrorsPerSession: 0.05,
  maxLegacyFallbackRate: 0.05,
  maxPoorFieldVitalRate: 0.1,
};

const healthy: V3ObservabilityAggregate = {
  exposedSessions: 50,
  bootstrapAttempts: 55,
  bootstrapFailures: 0,
  runtimeErrors: 1,
  legacyFallbacks: 1,
  criticalOperationAttempts: 14,
  criticalOperationConfirmed: 12,
  criticalOperationRejected: 1,
  criticalOperationUncertain: 1,
  unresolvedUncertainOperations: 0,
  reconciliationAttempts: 1,
  reconciliationResolved: 1,
  fieldVitalSamples: 100,
  poorFieldVitalSamples: 4,
};

describe('V3 rollout observability', () => {
  it('creates only structured low-cardinality telemetry intents with server time', () => {
    expect(
      createV3ObservabilityEvent({
        name: 'v3_workflow_outcome',
        stage: 'limited',
        serverObservedAt: '2026-10-12T04:00:00.000Z',
        surface: 'participate',
        workflow: 'jury',
        outcome: 'confirmed',
        device: 'mobile',
      }),
    ).toMatchObject({ workflow: 'jury', outcome: 'confirmed' });

    expect(() =>
      createV3ObservabilityEvent({
        name: 'v3_runtime_error',
        stage: 'shadow',
        serverObservedAt: 'not-a-time',
        outcome: 'failed',
      }),
    ).toThrow(/server-observed timestamp/);
  });

  it('blocks promotion when the cohort is too small even if observed rates look good', () => {
    const result = evaluateV3RolloutObservability(
      'limited',
      { ...healthy, exposedSessions: 3, bootstrapAttempts: 3, fieldVitalSamples: 4 },
      thresholds,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers.map((gate) => gate.id)).toEqual(
      expect.arrayContaining(['exposed-sessions', 'bootstrap-samples', 'field-vital-samples']),
    );
  });

  it('does not require critical workflow samples merely to leave shadow', () => {
    const result = evaluateV3RolloutObservability(
      'limited',
      {
        ...healthy,
        criticalOperationAttempts: 0,
        criticalOperationConfirmed: 0,
        criticalOperationRejected: 0,
        criticalOperationUncertain: 0,
        reconciliationAttempts: 0,
        reconciliationResolved: 0,
      },
      thresholds,
    );

    expect(result.ready).toBe(true);
    expect(result.gates.some((gate) => gate.id === 'critical-operation-samples')).toBe(false);
  });

  it('requires real critical-workflow evidence before full rollout', () => {
    const result = evaluateV3RolloutObservability(
      'full',
      { ...healthy, criticalOperationAttempts: 2 },
      thresholds,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers.some((gate) => gate.id === 'critical-operation-samples')).toBe(true);
  });

  it('blocks full rollout while any uncertain operation remains unresolved', () => {
    const result = evaluateV3RolloutObservability(
      'full',
      {
        ...healthy,
        criticalOperationUncertain: 2,
        unresolvedUncertainOperations: 1,
        reconciliationAttempts: 1,
        reconciliationResolved: 1,
      },
      thresholds,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers.map((gate) => gate.id)).toEqual(
      expect.arrayContaining([
        'no-unresolved-uncertain-operations',
        'uncertain-operation-reconciliation',
      ]),
    );
  });

  it('passes full rollout evidence when samples, rates and reconciliation are healthy', () => {
    const result = evaluateV3RolloutObservability('full', healthy, thresholds);
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('requires zero observed legacy fallback use before observability can support retirement', () => {
    const stillFallingBack = evaluateV3RolloutObservability('retire_legacy', healthy, thresholds);
    expect(stillFallingBack.ready).toBe(false);
    expect(stillFallingBack.blockers.some((gate) => gate.id === 'zero-observed-legacy-fallbacks')).toBe(
      true,
    );

    const cleanWindow = evaluateV3RolloutObservability(
      'retire_legacy',
      { ...healthy, legacyFallbacks: 0 },
      thresholds,
    );
    expect(cleanWindow.ready).toBe(true);
  });

  it('rejects internally impossible aggregate evidence', () => {
    expect(() =>
      evaluateV3RolloutObservability(
        'full',
        { ...healthy, bootstrapAttempts: 2, bootstrapFailures: 3 },
        thresholds,
      ),
    ).toThrow(/bootstrapFailures/);

    expect(() =>
      evaluateV3RolloutObservability(
        'full',
        { ...healthy, criticalOperationUncertain: 0, unresolvedUncertainOperations: 1 },
        thresholds,
      ),
    ).toThrow(/unresolvedUncertainOperations/);
  });
});
