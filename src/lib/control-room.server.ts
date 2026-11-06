import { buildControlRoomModel, type ControlRoomModel } from './control-room-model';
import type { EditionRuntimeState } from './edition-state';
import { runtimeStateFromRows, type EditionRuntimeStateRow, type EditionSubsystemStateRow } from './solaris-v2-persistence';

import { requireSolarisCapabilityServer } from '@/integrations/supabase/capabilities.server';
import { createSolarisAuthenticatedClientServer } from '@/integrations/supabase/organizer.server';
import { buildBroadcastRundown } from './broadcast-rundown';
import { parseStudio2BroadcastRundown } from './studio2-broadcast-rundown';

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

type IncidentSignalCounts = { active: number; critical: number };

/**
 * Only callers with canonical incident or integrity read capability may
 * retrieve incident counts. Use HEAD + exact count, not a full incident list:
 * Control Room needs severity signals, not private incident details.
 *
 * Null means "unverified", never "there are zero incidents".
 */
async function loadIncidentSignals(
  db: ReturnType<typeof createSolarisAuthenticatedClientServer>,
  editionId: string,
  authorized: boolean,
): Promise<IncidentSignalCounts | null> {
  if (!authorized) return null;

  const [active, critical] = await Promise.all([
    (db as any)
      .from('studio2_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('edition_id', editionId)
      .neq('status', 'resolved'),
    (db as any)
      .from('studio2_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('edition_id', editionId)
      .neq('status', 'resolved')
      .or('severity.eq.sev1,crisis_declared_at.not.is.null'),
  ]);

  const error = active.error ?? critical.error;
  if (error) {
    if (missingSchema(error)) return null;
    throw error;
  }

  // Missing count evidence must not be converted to an invented clean state.
  if (
    !Number.isSafeInteger(active.count) || active.count < 0 ||
    !Number.isSafeInteger(critical.count) || critical.count < 0
  ) {
    return null;
  }
  return { active: active.count, critical: critical.count };
}

type LiveCueLabels = { current: string | null; next: string | null };

/**
 * Surface only the existing, server-authorized production rundown. Avoid
 * guessing a live Show if zero or multiple Shows have an active status.
 * This projection never performs an operational command or changes a cue.
 */
async function loadLiveRundownCueLabels(
  db: ReturnType<typeof createSolarisAuthenticatedClientServer>,
  editionId: string,
  canManageEdition: boolean,
): Promise<LiveCueLabels | null> {
  if (!canManageEdition) return null;

  const { data: shows, error: showsError } = await (db as any)
    .from('shows')
    .select('id,status')
    .eq('edition_id', editionId)
    .in('status', ['live', 'active', 'open', 'in_progress'])
    .limit(2);

  if (showsError) {
    if (missingSchema(showsError)) return null;
    throw showsError;
  }
  // The query is deliberately bounded at two: ambiguous simultaneous live
  // candidates are not permission to invent an "active" show.
  if (!Array.isArray(shows) || shows.length !== 1 || typeof shows[0]?.id !== 'string') return null;

  // This RPC itself checks authoritative broadcast-management permission.
  // Edition scope is already constrained by the filtered Show query.
  const { data, error } = await (db as any).rpc('studio2_broadcast_rundown', {
    p_show_id: shows[0].id,
  });
  if (error) {
    if (missingSchema(error) || (error as { code?: string }).code === '42501') return null;
    throw error;
  }
  const config = parseStudio2BroadcastRundown({ studio2Rundown: data });
  if (!config) return null;

  const rundown = buildBroadcastRundown(config.startAt, config.segments);
  return {
    current: rundown.currentSegment?.label ?? null,
    next: rundown.nextSegment?.label ?? null,
  };
}

export async function loadControlRoomModelServer(editionId: string): Promise<ControlRoomModel> {
  if (!editionId) throw new Error('Edition id is required');
  const viewer = await requireSolarisCapabilityServer('edition.read', editionId);
  const canReadIncidents =
    viewer.capabilities.includes('incident.read') ||
    viewer.capabilities.includes('integrity.read');
  const canManageEdition = viewer.capabilities.includes('edition.manage');

  const db = createSolarisAuthenticatedClientServer();
  const [{ data: edition, error: editionError }, runtimeState] = await Promise.all([
    db.from('editions').select('id,name,status').eq('id', editionId).single(),
    loadPersistedRuntimeState(db, editionId),
  ]);

  if (editionError) throw editionError;

  const [
    { data: healthData, error: healthError },
    incidentCounts,
    liveCues,
  ] = await Promise.all([
    (db as any).rpc('admin_edition_health_summary', { _edition_id: editionId }),
    loadIncidentSignals(db, editionId, canReadIncidents),
    loadLiveRundownCueLabels(db, editionId, canManageEdition),
  ]);

  const health = healthError && missingSchema(healthError) ? null : healthData;
  if (healthError && !missingSchema(healthError)) throw healthError;

  return buildControlRoomModel({
    editionId: edition.id,
    editionName: edition.name,
    legacyEditionStatus: edition.status,
    runtimeState,
    healthStatus: health?.status ?? null,
    healthIssues: health?.issues_count ?? null,
    criticalIssues: health?.critical_count ?? null,
    activeIncidents: incidentCounts?.active ?? null,
    criticalIncidents: incidentCounts?.critical ?? null,
    currentSegment: liveCues?.current ?? null,
    nextSegment: liveCues?.next ?? null,
  });
}
