import { supabase } from '@/integrations/supabase/client';
import {
  buildStudio2HodWorkspaceSnapshot,
  mapStudio2HodContext,
  type Studio2HodWorkspaceSnapshot,
} from './studio2-hod-workspace';

export type Studio2CountryCockpitRow = Studio2HodWorkspaceSnapshot;

type SupabaseRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export function mapStudio2CountryCockpit(value: unknown): Studio2CountryCockpitRow[] {
  if (!Array.isArray(value)) throw new Error('Invalid country cockpit payload: expected an array');
  return value.map((row) => buildStudio2HodWorkspaceSnapshot(mapStudio2HodContext(row)));
}

export async function loadStudio2CountryCockpit(
  editionId: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2CountryCockpitRow[]> {
  if (!editionId) return [];
  const { data, error } = await client.rpc('studio2_country_cockpit', {
    p_edition_id: editionId,
  });
  if (error) throw error;
  return mapStudio2CountryCockpit(data);
}

export function summarizeCountryCockpit(rows: readonly Studio2CountryCockpitRow[]) {
  const ready = rows.filter((row) => row.operationalReadiness.state === 'ready').length;
  const attention = rows.filter(
    (row) => row.operationalReadiness.state === 'attention_required',
  ).length;
  const blocked = rows.filter((row) => row.operationalReadiness.state === 'blocked').length;
  const outstandingAcknowledgements = rows.reduce(
    (sum, row) => sum + row.model.outstandingAcknowledgements,
    0,
  );

  return {
    total: rows.length,
    ready,
    attention,
    blocked,
    outstandingAcknowledgements,
  };
}
