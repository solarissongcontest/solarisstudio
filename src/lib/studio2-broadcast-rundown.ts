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
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readRevision(value: unknown, legacyVersion: boolean) {
  if (value == null && legacyVersion) return 0;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseSegment(value: unknown): RundownSegment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.id)?.trim();
  const label = (readString(row.label) ?? readString(row.title))?.trim();
  const duration = readDuration(row.plannedDurationSeconds);
  const status = readString(row.status);
  if (!id || !label || duration == null || !status || !statusSet.has(status)) return null;

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
  const storedVersion = value.version;
  if (storedVersion !== 1 && storedVersion !== 2) return null;
  const revision = readRevision(value.revision, storedVersion === 1);
  if (revision == null) return null;

  const startAt = readString(value.startAt);
  if (!Array.isArray(value.segments)) return null;
  const parsedSegments = value.segments.map((segment) => parseSegment(segment));
  if (parsedSegments.some((segment) => segment === null)) return null;
  const segments = parsedSegments as RundownSegment[];

  if (!startAt || !Number.isFinite(new Date(startAt).getTime())) return null;

  const parsed: Studio2BroadcastRundownConfig = {
    version: 2,
    revision,
    startAt,
    segments,
    lockedAt: readString(value.lockedAt),
    lockedBy: readString(value.lockedBy),
    lockReason: readString(value.lockReason),
    updatedAt: readString(value.updatedAt),
    updatedBy: readString(value.updatedBy),
  };

  try {
    validateStudio2BroadcastRundown(parsed);
  } catch {
    return null;
  }
  return parsed;
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
  if (!Number.isInteger(config.revision) || config.revision < 0) throw new Error('Rundown revision is invalid.');
  if (!Number.isFinite(new Date(config.startAt).getTime())) throw new Error('Rundown start time is invalid.');
  const ids = new Set<string>();
  let liveCount = 0;
  for (const segment of config.segments) {
    if (!segment.id.trim()) throw new Error('Every rundown segment needs an id.');
    if (ids.has(segment.id)) throw new Error(`Duplicate rundown segment id: ${segment.id}`);
    ids.add(segment.id);
    if (!segment.label.trim()) throw new Error('Every rundown segment needs a label.');
    if (!Number.isInteger(segment.plannedDurationSeconds) || segment.plannedDurationSeconds <= 0) {
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

export function validateStudio2BroadcastCommandResult(
  value: unknown,
  expectedRevision: number,
  mode: 'increment' | 'same-or-increment',
): Studio2BroadcastRundownConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Broadcast rundown command returned an invalid payload.');
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2 || typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision < 0) {
    throw new Error('Broadcast rundown command returned invalid version evidence.');
  }
  const parsed = parseRundownValue(value);
  if (!parsed) throw new Error('Broadcast rundown command returned an invalid payload.');

  const allowed = mode === 'increment'
    ? parsed.revision === expectedRevision + 1
    : parsed.revision === expectedRevision || parsed.revision === expectedRevision + 1;
  if (!allowed) {
    throw new Error('Broadcast rundown command returned inconsistent revision evidence.');
  }
  return parsed;
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('broadcast_rundown'))) {
    throw new Error('Broadcast Rundown is disabled by the Studio 2 rollout flag.');
  }
}

function requireShowId(showId: string) {
  const normalized = showId.trim();
  if (!normalized) throw new Error('Show is required.');
  return normalized;
}

function requireReason(reason: string, label = 'Broadcast rundown') {
  const normalized = reason.trim();
  if (normalized.length < 5) throw new Error(`${label} reason must be at least 5 characters.`);
  return normalized;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2BroadcastRundown(showId: string): Promise<Studio2BroadcastRundownConfig | null> {
  await requireEnabled();
  const data = await rpc('studio2_broadcast_rundown', { p_show_id: requireShowId(showId) });
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
    p_show_id: requireShowId(showId),
    p_expected_revision: config.revision,
    p_start_at: config.startAt,
    p_segments: config.segments,
    p_reason: requireReason(reason),
  });
  return validateStudio2BroadcastCommandResult(data, config.revision, 'increment');
}

export async function setStudio2BroadcastRundownLock(
  showId: string,
  config: Studio2BroadcastRundownConfig,
  locked: boolean,
  reason: string,
): Promise<Studio2BroadcastRundownConfig> {
  await requireEnabled();
  validateStudio2BroadcastRundown(config);
  const data = await rpc('studio2_set_broadcast_rundown_lock', {
    p_show_id: requireShowId(showId),
    p_expected_revision: config.revision,
    p_locked: locked,
    p_reason: requireReason(reason, 'Broadcast rundown lock'),
  });
  return validateStudio2BroadcastCommandResult(data, config.revision, 'same-or-increment');
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
  validateStudio2BroadcastRundown(config);
  const normalizedSegmentId = segmentId.trim();
  if (!normalizedSegmentId) throw new Error('Rundown segment is required.');
  const data = await rpc('studio2_transition_broadcast_segment', {
    p_show_id: requireShowId(showId),
    p_expected_revision: config.revision,
    p_segment_id: normalizedSegmentId,
    p_to_status: nextStatus,
    p_reason: requireReason(reason, 'Broadcast segment transition'),
  });
  return validateStudio2BroadcastCommandResult(data, config.revision, 'increment');
}
