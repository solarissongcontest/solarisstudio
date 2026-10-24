import { createServerFn } from '@tanstack/react-start';

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from '@/integrations/supabase/organizer.server';
import { type SolarisFeatureFlag } from '@/lib/feature-flags';
import { studio2RolloutDecision, studio2SurfaceFor } from '@/lib/studio2-product-surfaces';

type RolloutPreview = {
  key: SolarisFeatureFlag;
  currentRevision: number;
  enabled: boolean;
  adminsOnly: boolean;
  noChange: boolean;
  riskClass: string;
};

type OperationEnvelope = {
  operationId?: string;
  status?: string;
  replayed?: boolean;
  result?: Record<string, unknown> | null;
};

type RolloutDesiredState = {
  key: SolarisFeatureFlag;
  enabled: boolean;
  adminsOnly: boolean;
  userIds: string[];
  editionIds: string[];
};

type RolloutApplyOutcome =
  | {
      status: 'succeeded';
      ok: true;
      operationId: string;
      replayed: boolean;
      result: Record<string, unknown>;
    }
  | {
      status: 'unconfirmed';
      ok: false;
      operationId: string;
      message: string;
    };

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
}

function desiredState(data: {
  key: SolarisFeatureFlag;
  enabled: boolean;
  adminsOnly: boolean;
  userIds: string[];
  editionIds: string[];
}): RolloutDesiredState {
  return {
    key: requiredString(data?.key, 'Feature key') as SolarisFeatureFlag,
    enabled: data?.enabled === true,
    adminsOnly: data?.adminsOnly === true,
    userIds: stringArray(data?.userIds),
    editionIds: stringArray(data?.editionIds),
  };
}

async function organizerClient() {
  await requireSolarisOrganizerServer();
  return createSolarisAuthenticatedClientServer() as any;
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value) return value;
  }
  return fallback;
}

function normalizePreview(data: unknown): RolloutPreview {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Feature rollout preview returned an invalid response.');
  }
  const row = data as Record<string, unknown>;
  const currentRevision = Number(row.currentRevision);
  if (
    typeof row.key !== 'string' ||
    !Number.isSafeInteger(currentRevision) ||
    currentRevision < 0 ||
    typeof row.enabled !== 'boolean' ||
    typeof row.adminsOnly !== 'boolean' ||
    typeof row.noChange !== 'boolean'
  ) {
    throw new Error('Feature rollout preview returned incomplete review evidence.');
  }
  return {
    key: row.key as SolarisFeatureFlag,
    currentRevision,
    enabled: row.enabled,
    adminsOnly: row.adminsOnly,
    noChange: row.noChange,
    riskClass: typeof row.riskClass === 'string' ? row.riskClass : 'R1',
  };
}

function normalizeOperation(data: unknown, operationId: string): RolloutApplyOutcome {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Feature rollout operation returned an invalid receipt.');
  }
  const envelope = data as OperationEnvelope;
  if (envelope.status !== 'succeeded' || !envelope.result) {
    throw new Error(`Feature rollout operation ${operationId} is ${envelope.status ?? 'not confirmed'}.`);
  }
  return {
    status: 'succeeded',
    ok: true,
    operationId: envelope.operationId ?? operationId,
    replayed: Boolean(envelope.replayed),
    result: envelope.result,
  };
}

async function reconcileKnownOperation(client: any, operationId: string) {
  const response = await client.rpc('studio2_reconcile_operation', {
    p_operation_id: operationId,
  });
  if (response.error) {
    if (errorCode(response.error) === 'P0002') return null;
    throw response.error;
  }
  return normalizeOperation(response.data, operationId);
}

function assertDependencyPreflight(rows: unknown[], key: SolarisFeatureFlag, nextEnabled: boolean) {
  const enabledKeys = new Set<SolarisFeatureFlag>();
  let currentEnabled = !nextEnabled;

  for (const candidate of rows) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    if (typeof row.key !== 'string') continue;
    if (row.enabled === true) enabledKeys.add(row.key as SolarisFeatureFlag);
    if (row.key === key) currentEnabled = row.enabled === true;
  }

  const decision = studio2RolloutDecision(key, currentEnabled, enabledKeys);
  if (decision.allowed) return;

  const surface = studio2SurfaceFor(key);
  const labels = decision.blockingKeys.map((blockingKey) => studio2SurfaceFor(blockingKey).label).join(', ');
  if (decision.reason === 'rollout_locked') {
    throw new Error(`${surface.label} is not eligible for rollout from this workstream.`);
  }
  if (decision.reason === 'missing_dependencies') {
    throw new Error(`Enable ${labels} before ${surface.label}.`);
  }
  if (decision.reason === 'active_dependents') {
    throw new Error(`Disable ${labels} before disabling ${surface.label}.`);
  }
}

export const previewFeatureRolloutChange = createServerFn({ method: 'POST' })
  .inputValidator((data: RolloutDesiredState) => desiredState(data))
  .handler(async ({ data }) => {
    const client = await organizerClient();
    const response = await client.rpc('studio2_feature_flag_change_preview', {
      p_key: data.key,
      p_enabled: data.enabled,
      p_admins_only: data.adminsOnly,
      p_user_ids: data.userIds,
      p_edition_ids: data.editionIds,
    });
    if (response.error) throw new Error(errorMessage(response.error, 'Feature rollout preview failed.'));
    return normalizePreview(response.data);
  });

export const applyFeatureRolloutChange = createServerFn({ method: 'POST' })
  .inputValidator((data: RolloutDesiredState & { expectedRevision: number; operationId: string }) => ({
    ...desiredState(data),
    expectedRevision: Number(data?.expectedRevision),
    operationId: requiredString(data?.operationId, 'Operation ID'),
  }))
  .handler(async ({ data }): Promise<RolloutApplyOutcome> => {
    if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) {
      throw new Error('Reviewed rollout revision is invalid.');
    }

    const client = await organizerClient();

    // A retry after a lost response must reconcile the exact operation before
    // considering any new write or dependency snapshot.
    const recovered = await reconcileKnownOperation(client, data.operationId);
    if (recovered) return recovered;

    const current = await client
      .from('studio2_feature_flags')
      .select('key,enabled');
    if (current.error) throw new Error(errorMessage(current.error, 'Feature rollout state could not be re-read.'));

    // This is an operator-facing preflight only. The System command must also
    // validate dependency integrity atomically inside its mutation transaction.
    assertDependencyPreflight(Array.isArray(current.data) ? current.data : [], data.key, data.enabled);

    try {
      const response = await client.rpc('studio2_apply_feature_flag_change', {
        p_key: data.key,
        p_enabled: data.enabled,
        p_admins_only: data.adminsOnly,
        p_user_ids: data.userIds,
        p_edition_ids: data.editionIds,
        p_operation_id: data.operationId,
        p_idempotency_key: `rollout.change:${data.operationId}`,
        p_expected_revision: data.expectedRevision,
        p_correlation_id: data.operationId,
      });
      if (response.error) throw response.error;
      return normalizeOperation(response.data, data.operationId);
    } catch (applyError) {
      try {
        const reconciled = await reconcileKnownOperation(client, data.operationId);
        if (reconciled) return reconciled;
      } catch (reconcileError) {
        return {
          status: 'unconfirmed',
          ok: false,
          operationId: data.operationId,
          message: `Solaris could not confirm operation ${data.operationId}. Retry this exact reviewed operation to reconcile it before taking another rollout action. ${errorMessage(reconcileError, '')}`.trim(),
        };
      }

      return {
        status: 'unconfirmed',
        ok: false,
        operationId: data.operationId,
        message: `No durable receipt for operation ${data.operationId} was visible after the apply attempt. Retry this exact reviewed operation before taking another rollout action. ${errorMessage(applyError, '')}`.trim(),
      };
    }
  });
