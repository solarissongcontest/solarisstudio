import { supabase } from '@/integrations/supabase/client';
import {
  BROADCAST_RUNDOWN_STATUSES,
  buildBroadcastRundown,
  type BroadcastRundownSegment,
  type BroadcastRundownStatus,
} from './broadcast-rundown';
import { isStudio2FeatureEnabled } from './studio2-feature-flags';

export const STUDIO2_RUNDOWN_CONFIG_KEY = 'studio2Rundown';

export type Studio2BroadcastRundownConfig = {
  version: 1;
  startAt: string;
  segments: BroadcastRundownSegment[];
};

type ShowConfigRow = {
  id: string;
  broadcast_config: Record<string, unknown> | null;
};

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
type QueryBuilder = {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  update(values: Record<string, unknown>): QueryBuilder;
  maybeSingle(): QueryResult;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
type RundownClient = { from(table: string): QueryBuilder };
const client = supabase as unknown as RundownClient;

const statusSet = new Set<string>(BROADCAST_RUNDOWN_STATUSES);

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function parseSegment(value: unknown, index: number): BroadcastRundownSegment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.id) ?? `segment-${index + 1}`;
  const title = readString(row.title)?.trim();
  const duration = readDuration(row.plannedDurationSeconds);
  const status = readString(row.status);
  if (!title || duration == null || !status || !statusSet.has(status)) return null;

  return {
    id,
    title,
    status: status as BroadcastRundownStatus,
    plannedDurationSeconds: duration,
    actualStartedAt: readString(row.actualStartedAt),
    actualCompletedAt: readString(row.actualCompletedAt),
  };
}

export function parseStudio2BroadcastRundown(
  broadcastConfig: Record<string, unknown> | null | undefined,
): Studio2BroadcastRundownConfig | null {
  const raw = broadcastConfig?.[STUDIO2_RUNDOWN_CONFIG_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const startAt = readString(value.startAt);
  const rawSegments = Array.isArray(value.segments) ? value.segments : [];
  const segments = rawSegments
    .map((segment, index) => parseSegment(segment, index))
    .filter((segment): segment is BroadcastRundownSegment => segment !== null);

  if (!startAt || !Number.isFinite(new Date(startAt).getTime())) return null;
  return { version: 1, startAt, segments };
}

export function createDefaultBroadcastRundown(startAt = new Date().toISOString()): Studio2BroadcastRundownConfig {
  return {
    version: 1,
    startAt,
    segments: [
      { id: 'opening', title: 'Opening sequence', status: 'planned', plannedDurationSeconds: 180 },
      { id: 'performances', title: 'Performances', status: 'planned', plannedDurationSeconds: 3600 },
      { id: 'voting', title: 'Voting window', status: 'planned', plannedDurationSeconds: 900 },
      { id: 'results', title: 'Results sequence', status: 'planned', plannedDurationSeconds: 1200 },
      { id: 'closing', title: 'Closing sequence', status: 'planned', plannedDurationSeconds: 300 },
    ],
  };
}

export function validateStudio2BroadcastRundown(config: Studio2BroadcastRundownConfig) {
  if (!Number.isFinite(new Date(config.startAt).getTime())) throw new Error('Rundown start time is invalid.');
  const ids = new Set<string>();
  for (const segment of config.segments) {
    if (!segment.id.trim()) throw new Error('Every rundown segment needs an id.');
    if (ids.has(segment.id)) throw new Error(`Duplicate rundown segment id: ${segment.id}`);
    ids.add(segment.id);
    if (!segment.title.trim()) throw new Error('Every rundown segment needs a title.');
    if (!Number.isFinite(segment.plannedDurationSeconds) || segment.plannedDurationSeconds <= 0) {
      throw new Error(`Invalid duration for ${segment.title}.`);
    }
  }
  buildBroadcastRundown(config.segments, config.startAt);
}

async function requireEnabled() {
  if (!(await isStudio2FeatureEnabled('broadcast_rundown'))) {
    throw new Error('Broadcast Rundown is disabled by the Studio 2 rollout flag.');
  }
}

export async function loadStudio2BroadcastRundown(showId: string): Promise<Studio2BroadcastRundownConfig | null> {
  await requireEnabled();
  const { data, error } = await client
    .from('shows')
    .select('id,broadcast_config')
    .eq('id', showId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ShowConfigRow;
  return parseStudio2BroadcastRundown(row.broadcast_config);
}

export async function saveStudio2BroadcastRundown(showId: string, config: Studio2BroadcastRundownConfig) {
  await requireEnabled();
  validateStudio2BroadcastRundown(config);

  const { data: currentData, error: currentError } = await client
    .from('shows')
    .select('id,broadcast_config')
    .eq('id', showId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!currentData) throw new Error('Show not found.');

  const row = currentData as ShowConfigRow;
  const nextBroadcastConfig = {
    ...(row.broadcast_config ?? {}),
    [STUDIO2_RUNDOWN_CONFIG_KEY]: config,
  };

  const { error } = await client
    .from('shows')
    .update({ broadcast_config: nextBroadcastConfig })
    .eq('id', showId);
  if (error) throw error;
  return config;
}
