import { buildControlRoomModel, type ControlRoomModel } from './control-room-model';
import type { EditionRuntimeState } from './edition-state';
import { runtimeStateFromRows, type EditionRuntimeStateRow, type EditionSubsystemStateRow } from './solaris-v2-persistence';

import { requireSolarisCapabilityServer } from '@/integrations/supabase/capabilities.server';
import { createSolarisAuthenticatedClientServer } from '@/integrations/supabase/organizer.server';

function missingSchema(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('pgrst205')
  );
}

async function loadPersistedRuntimeState(
  db: ReturnType<typeof createSolarisAuthenticatedClientServer>,
  editionId: string,
): Promise<EditionRuntimeState | null> {
  const [runtimeResult, subsystemResult] = await Promise.all([
    (db as any)
      .from('edition_runtime_state')
      .select('edition_id,state,revision,changed_by,changed_at')
      .eq('edition_id', editionId)
      .maybeSingle(),
    (db as any)
      .from('edition_subsystem_states')
      .select('edition_id,subsystem,state,revision,changed_by,changed_at')
      .eq('edition_id', editionId),
  ]);

  if (runtimeResult.error || subsystemResult.error) {
    const error = runtimeResult.error ?? subsystemResult.error;
    if (missingSchema(error)) return null;
    throw error;
  }

  if (!runtimeResult.data) return null;

  try {
    return runtimeStateFromRows(
      runtimeResult.data as EditionRuntimeStateRow,
      (subsystemResult.data ?? []) as EditionSubsystemStateRow[],
    );
  } catch {
    // During incremental rollout, incomplete subsystem rows must never make the
    // Organizer unusable. Fall back to the existing edition.status mapping.
    return null;
  }
}

export async function loadControlRoomModelServer(editionId: string): Promise<ControlRoomModel> {
  if (!editionId) throw new Error('Edition id is required');
  await requireSolarisCapabilityServer('edition.read', editionId);

  const db = createSolarisAuthenticatedClientServer();
  const [{ data: edition, error: editionError }, runtimeState] = await Promise.all([
    db.from('editions').select('id,name,status').eq('id', editionId).single(),
    loadPersistedRuntimeState(db, editionId),
  ]);

  if (editionError) throw editionError;

  const { data: healthData, error: healthError } = await (db as any).rpc(
    'admin_edition_health_summary',
    { _edition_id: editionId },
  );

  const health = healthError && missingSchema(healthError) ? null : healthData;
  if (healthError && !missingSchema(healthError)) throw healthError;

  return buildControlRoomModel({
    editionId: edition.id,
    editionName: edition.name,
    legacyEditionStatus: edition.status,
    runtimeState,
    healthStatus: health?.status ?? null,
    healthIssues: health?.issues_count ?? 0,
    criticalIssues: health?.critical_count ?? 0,
    activeIncidents: 0,
    criticalIncidents: 0,
  });
}
