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

/**
 * Delegation search is a view concern over the canonical country cockpit
 * projection. It never broadens edition scope or performs a second data read.
 */
export function matchesStudio2CountryCockpitQuery(
  row: Studio2CountryCockpitRow,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const searchableValues = [
    row.context.countryName,
    row.context.entry?.artist,
    row.context.entry?.songTitle,
    ...row.context.juryMembers.map((member) => member.displayName),
  ];

  return searchableValues.some(
    (value) => typeof value === 'string' && value.toLocaleLowerCase().includes(normalizedQuery),
  );
}

const operationalStateRank: Record<
  Studio2CountryCockpitRow['operationalReadiness']['state'],
  number
> = {
  blocked: 0,
  attention_required: 1,
  ready: 2,
};

/**
 * Organizer lists must surface exceptions before normality. This function only
 * orders already-canonical country cockpit projections; it does not calculate
 * readiness or invent a separate task state.
 */
export function sortStudio2CountryCockpitOperationally(
  rows: readonly Studio2CountryCockpitRow[],
): Studio2CountryCockpitRow[] {
  return [...rows].sort((a, b) => {
    const state = operationalStateRank[a.operationalReadiness.state] - operationalStateRank[b.operationalReadiness.state];
    if (state) return state;

    const overdue =
      b.operationalReadiness.overdueDeadlines.length -
      a.operationalReadiness.overdueDeadlines.length;
    if (overdue) return overdue;

    const issues = b.context.unresolvedOrganizerIssues - a.context.unresolvedOrganizerIssues;
    if (issues) return issues;

    const score = a.operationalReadiness.score - b.operationalReadiness.score;
    if (score) return score;

    return a.context.countryName.localeCompare(b.context.countryName);
  });
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
