import { supabase } from '@/integrations/supabase/client';
import {
  RUNDOWN_SEGMENT_STATUSES,
  buildBroadcastRundown,
  type RundownSegment,
  type RundownSegmentStatus,
} from './broadcast-rundown';
import { isStudio2FeatureEnabled } from './studio2-feature-flags';

export const STUDIO2_RUNDOWN_CONFIG_KEY = 'studio2Rundown';

export type Studio2BroadcastMode = 'production' | 'rehearsal';

export type Studio2BroadcastRundownConfig = {
  version: 2;
  revision: number;
  startAt: string;
  segments: RundownSegment[];
  lockedAt: string | null;
  lockedBy: string | null;
  lockReason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type Studio2BroadcastReadiness = {
  state: 'ready' | 'attention' | 'blocked';
  blockers: string[];
  warnings: string[];
  currentSegmentId: string | null;
  nextSegmentId: string | null;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as RpcClient;
const statusSet = new Set<string>(RUNDOWN_SEGMENT_STATUSES);

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function readNonNegativeInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function parseSegment(value: unknown, index: number): RundownSegment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.id) ?? `segment-${index + 1}`;
  const label = (readString(row.label) ?? readString(row.title))?.trim();
  const duration = readDuration(row.plannedDurationSeconds);
  const status = readString(row.status);
  if (!label || duration == null || !status || !statusSet.has(status)) return null;

  return {
    id,
    label,
    status: status as RundownSegmentStatus,
    plannedDurationSeconds: duration,
    actualStartedAt: readString(row.actualStartedAt),
    actualCompletedAt: readString(row.actualCompletedAt),
  };
}

function parseRundownValue(raw: unknown): Studio2BroadcastRundownConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const startAt = readString(value.startAt);
  const rawSegments = Array.isArray(value.segments) ? value.segments : [];
  const segments = rawSegments
    .map((segment, index) => parseSegment(segment, index))
    .filter((segment): segment is RundownSegment => segment !== null);

  if (!startAt || !Number.isFinite(new Date(startAt).getTime())) return null;

  return {
    version: 2,
    revision: readNonNegativeInteger(value.revision),
    startAt,
    segments,
    lockedAt: readString(value.lockedAt),
    lockedBy: readString(value.lockedBy),
    lockReason: readString(value.lockReason),
    updatedAt: readString(value.updatedAt),
    updatedBy: readString(value.updatedBy),
  };
}

export function parseStudio2BroadcastRundown(
  broadcastConfig: Record<string, unknown> | null | undefined,
): Studio2BroadcastRundownConfig | null {
  return parseRundownValue(broadcastConfig?.[STUDIO2_RUNDOWN_CONFIG_KEY]);
}

export function createDefaultBroadcastRundown(startAt = new Date().toISOString()): Studio2BroadcastRundownConfig {
  return {
    version: 2,
    revision: 0,
    startAt,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    updatedAt: null,
    updatedBy: null,
    segments: [
      { id: 'opening', label: 'Opening sequence', status: 'planned', plannedDurationSeconds: 180 },
      { id: 'performances', label: 'Performances', status: 'planned', plannedDurationSeconds: 3600 },
      { id: 'voting', label: 'Voting window', status: 'planned', plannedDurationSeconds: 900 },
      { id: 'results', label: 'Results sequence', status: 'planned', plannedDurationSeconds: 1200 },
      { id: 'closing', label: 'Closing sequence', status: 'planned', plannedDurationSeconds: 300 },
    ],
  };
}

export function validateStudio2BroadcastRundown(config: Studio2BroadcastRundownConfig) {
  if (!Number.isFinite(new Date(config.startAt).getTime())) throw new Error('Rundown start time is invalid.');
  const ids = new Set<string>();
  let liveCount = 0;
  for (const segment of config.segments) {
    if (!segment.id.trim()) throw new Error('Every rundown segment needs an id.');
    if (ids.has(segment.id)) throw new Error(`Duplicate rundown segment id: ${segment.id}`);
    ids.add(segment.id);
    if (!segment.label.trim()) throw new Error('Every rundown segment needs a label.');
    if (!Number.isFinite(segment.plannedDurationSeconds) || segment.plannedDurationSeconds <= 0) {
      throw new Error(`Invalid duration for ${segment.label}.`);
    }
    if (segment.status === 'live') liveCount += 1;
  }
  if (liveCount > 1) throw new Error('Only one rundown segment can be live at a time.');
  buildBroadcastRundown(config.startAt, config.segments);
}

export function buildStudio2BroadcastReadiness(config: Studio2BroadcastRundownConfig | null): Studio2BroadcastReadiness {
  if (!config) {
    return {
      state: 'blocked',
      blockers: ['No broadcast rundown has been configured.'],
      warnings: [],
      currentSegmentId: null,
      nextSegmentId: null,
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!config.segments.length) blockers.push('The rundown has no segments.');
  if (!config.lockedAt) warnings.push('The rundown is not locked for broadcast.');
  if (config.segments.some((segment) => !segment.label.trim())) blockers.push('One or more segments have no label.');
  if (config.segments.some((segment) => segment.status === 'planned')) warnings.push('One or more segments are still only planned.');

  const timing = buildBroadcastRundown(config.startAt, config.segments);
  return {
    state: blockers.length ? 'blocked' : warnings.length ? 'attention' : 'ready',
    blockers,
    warnings,
    currentSegmentId: timing.currentSegment?.id ?? null,
    nextSegmentId: timing.nextSegment?.id ?? null,
  };
}

export function rehearseStudio2BroadcastTransition(
  config: Studio2BroadcastRundownConfig,
  segmentId: string,
  nextStatus: RundownSegmentStatus,
  now = new Date(),
): Studio2BroadcastRundownConfig {
  const current = config.segments.find((segment) => segment.id === segmentId);
  if (!current) throw new Error('Rundown segment not found.');
  const allowed: Record<RundownSegmentStatus, RundownSegmentStatus[]> = {
    planned: ['ready', 'skipped'],
    ready: ['live', 'skipped'],
    live: ['completed', 'skipped'],
    completed: [],
    skipped: [],
  };
  if (!allowed[current.status].includes(nextStatus)) {
    throw new Error(`Invalid segment transition: ${current.status} → ${nextStatus}`);
  }
  if (nextStatus === 'live' && config.segments.some((segment) => segment.id !== segmentId && segment.status === 'live')) {
    throw new Error('Another rundown segment is already live.');
  }

  const timestamp = now.toISOString();
  return {
    ...config,
    segments: config.segments.map((segment) => segment.id !== segmentId ? segment : {
      ...segment,
      status: nextStatus,
      actualStartedAt: nextStatus === 'live' ? segment.actualStartedAt ?? timestamp : segment.actualStartedAt,
      actualCompletedAt: ['completed', 'skipped'].includes(nextStatus) ? segment.actualCompletedAt ?? timestamp : segment.actualCompletedAt,
    }),
  };
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('broadcast_rundown'))) {
    throw new Error('Broadcast Rundown is disabled by the Studio 2 rollout flag.');
  }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2BroadcastRundown(showId: string): Promise<Studio2BroadcastRundownConfig | null> {
  await requireEnabled();
  const data = await rpc('studio2_broadcast_rundown', { p_show_id: showId });
  return parseRundownValue(data);
}

export async function saveStudio2BroadcastRundown(
  showId: string,
  config: Studio2BroadcastRundownConfig,
  reason = 'Broadcast rundown edited',
): Promise<Studio2BroadcastRundownConfig> {
  await requireEnabled();
  validateStudio2BroadcastRundown(config);
  const data = await rpc('studio2_save_broadcast_rundown', {
    p_show_id: showId,
    p_expected_revision: config.revision,
    p_start_at: config.startAt,
    p_segments: config.segments,
    p_reason: reason,
  });
  const parsed = parseRundownValue(data);
  if (!parsed) throw new Error('Broadcast rundown save returned an invalid payload.');
  return parsed;
}

export async function setStudio2BroadcastRundownLock(
  showId: string,
  config: Studio2BroadcastRundownConfig,
  locked: boolean,
  reason: string,
): Promise<Studio2BroadcastRundownConfig> {
  await requireEnabled();
  const data = await rpc('studio2_set_broadcast_rundown_lock', {
    p_show_id: showId,
    p_expected_revision: config.revision,
    p_locked: locked,
    p_reason: reason,
  });
  const parsed = parseRundownValue(data);
  if (!parsed) throw new Error('Broadcast rundown lock command returned an invalid payload.');
  return parsed;
}

export async function transitionStudio2BroadcastSegment(
  showId: string,
  config: Studio2BroadcastRundownConfig,
  segmentId: string,
  nextStatus: RundownSegmentStatus,
  reason: string,
  mode: Studio2BroadcastMode = 'production',
): Promise<Studio2BroadcastRundownConfig> {
  if (mode === 'rehearsal') return rehearseStudio2BroadcastTransition(config, segmentId, nextStatus);
  await requireEnabled();
  const data = await rpc('studio2_transition_broadcast_segment', {
    p_show_id: showId,
    p_expected_revision: config.revision,
    p_segment_id: segmentId,
    p_to_status: nextStatus,
    p_reason: reason,
  });
  const parsed = parseRundownValue(data);
  if (!parsed) throw new Error('Broadcast segment transition returned an invalid payload.');
  return parsed;
}
