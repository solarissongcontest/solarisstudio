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

type PostgrestLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function normalizeCountryCockpitRpcError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (!error || typeof error !== 'object') {
    return new Error('Country cockpit request failed before Solaris returned a diagnostic.');
  }

  const candidate = error as PostgrestLikeError;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const lowerMessage = message.toLowerCase();

  if (code === '42501' || lowerMessage.includes('capability required')) {
    return new Error(
      'Country cockpit access was denied for this edition. Check the Organizer Confirmation capability and current platform operating mode.',
    );
  }

  if (code === 'PGRST202' || code === '42883' || lowerMessage.includes('function')) {
    return new Error(
      'The Country cockpit backend contract is unavailable on this deployment. Check Supabase migration parity before retrying.',
    );
  }

  if (code === 'P0002' || lowerMessage.includes('edition not found')) {
    return new Error('The selected edition no longer exists or is outside the current Organizer scope.');
  }

  if (code === '22023') {
    return new Error('The Country cockpit request used an invalid edition context. Reselect the edition and retry.');
  }

  return new Error(message || 'Country cockpit request failed. Retry or inspect the backend operation log.');
}

export function mapStudio2CountryCockpit(value: unknown): Studio2CountryCockpitRow[] {
  if (!Array.isArray(value)) throw new Error('Invalid country cockpit payload: expected an array');
  return value.map((row) => buildStudio2HodWorkspaceSnapshot(mapStudio2HodContext(row)));
}

export async function loadStudio2CountryCockpit(
  editionId: string,
  client: SupabaseRpcClient = supabase as unknown as SupabaseRpcClient,
): Promise<Studio2CountryCockpitRow[]> {
  const normalizedEditionId = editionId.trim();
  if (!normalizedEditionId) throw new Error('Country cockpit requires an explicit edition scope.');
  const { data, error } = await client.rpc('studio2_country_cockpit', {
    p_edition_id: normalizedEditionId,
  });
  if (error) throw normalizeCountryCockpitRpcError(error);

  const rows = mapStudio2CountryCockpit(data);
  if (rows.some((row) => row.context.editionId !== normalizedEditionId)) {
    throw new Error('Country cockpit returned data outside the selected edition scope.');
  }
  const countryIds = rows.map((row) => row.context.countryId);
  if (new Set(countryIds).size !== countryIds.length) {
    throw new Error('Country cockpit returned duplicate country rows for the selected edition.');
  }
  return rows;
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
