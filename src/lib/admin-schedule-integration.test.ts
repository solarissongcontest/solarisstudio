import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  selectedEdition: 'edition-22',
  editionRow: { id: 'edition-22', slug: 'ssc22', event_date: null } as Record<string, unknown> | null,
  fromCalls: [] as string[],
  remoteQueries: [] as string[][],
  failureTable: null as string | null,
  tableRows: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

vi.mock('@/components/admin/AdminContext', () => ({
  useAdminContext: () => ({ editionId: state.selectedEdition }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.fromCalls.push(table);
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        not: () => q,
        maybeSingle: async () => ({
          data: state.editionRow,
          error: state.failureTable === table ? { message: 'Unavailable' } : null,
        }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({
            data: state.tableRows[table] ?? [],
            error: state.failureTable === table ? { message: 'Unavailable' } : null,
          }).then(resolve, reject),
      };
      return q;
    },
    schema: (schema: string) => ({
      from: (table: string) => {
        state.fromCalls.push(schema + '.' + table);
        const q = {
          select: () => q,
          in: (_column: string, ids: string[]) => {
            state.remoteQueries.push([...ids]);
            return Promise.resolve({
              data: state.tableRows[schema + '.' + table] ?? [],
              error: null,
            });
          },
        };
        return q;
      },
    }),
  },
}));

import { useAdminOperationalSchedule, type AdminScheduleItem } from './admin-schedule';

type HookConfig = {
  enabled: boolean;
  queryFn: () => Promise<AdminScheduleItem[]>;
};

let capturedQuery: HookConfig | null = null;

// Invoke the hook inside a real React component. The query transport is
// mocked above, so no network or Supabase provider is required.
function ScheduleProbe({ editionId, slug }: { editionId: string; slug?: string | null }) {
  capturedQuery = useAdminOperationalSchedule(editionId, slug) as unknown as HookConfig;
  return null;
}

function schedule(editionId = 'edition-22', slug?: string | null): HookConfig {
  capturedQuery = null;
  renderToStaticMarkup(createElement(ScheduleProbe, { editionId, slug }));
  if (!capturedQuery) throw new Error('Operational schedule hook did not render.');
  return capturedQuery;
}

describe('Organizer operational schedule read scope', () => {
  beforeEach(() => {
    state.selectedEdition = 'edition-22';
    state.editionRow = { id: 'edition-22', slug: 'ssc22', event_date: null };
    state.fromCalls = [];
    state.remoteQueries = [];
    state.failureTable = null;
    state.tableRows = {};
  });

  it('rejects a stale deep-link slug after only the exact edition lookup', async () => {
    await expect(schedule('edition-22', 'ssc21').queryFn())
      .rejects.toThrow('does not match the selected edition');
    expect(state.fromCalls).toEqual(['editions']);
  });

  it('rejects missing and mismatched edition rows before other source reads', async () => {
    state.editionRow = null;
    await expect(schedule('edition-22', 'ssc22').queryFn()).rejects.toThrow('cannot verify');
    expect(state.fromCalls).toEqual(['editions']);

    state.fromCalls = [];
    state.editionRow = { id: 'edition-21', slug: 'ssc21' };
    await expect(schedule('edition-22', 'ssc22').queryFn()).rejects.toThrow('different edition');
    expect(state.fromCalls).toEqual(['editions']);
  });

  it('uses the verified slug for show, entry and jury links and deduplicates remote IDs', async () => {
    state.tableRows.shows = [{ id: 'final', name: 'Grand Final' }];
    state.tableRows.jury_voting_windows = [{
      show_id: 'final', opened_at: '2026-11-06T20:00:00Z', closed_at: null,
    }];
    state.tableRows.participants = [{
      id: 'entry-1', artist: 'A', song: 'B', scheduled_publish_at: '2026-11-07T20:00:00Z',
    }];
    state.tableRows.televoting_round_bindings = [
      { remote_round_id: 'round1', show_id: 'final' },
      { remote_round_id: 'round1', show_id: 'final' },
    ];
    state.tableRows['televoting.rounds'] = [{
      id: 'round1', name: 'Final', opened_at: '2026-11-06T21:00:00Z', closed_at: null,
    }];

    const items = await schedule('edition-22').queryFn();
    expect(state.fromCalls[0]).toBe('editions');
    expect(state.fromCalls.filter((table) => table === 'editions')).toHaveLength(1);
    expect(state.remoteQueries).toEqual([['round1']]);
    expect(items.find((item) => item.source === 'jury')?.href).toBe('/admin/jury/ssc22');
    expect(items.find((item) => item.source === 'publication')?.href).toBe('/admin/entries/ssc22');
  });

  it('disables data access when the requested edition differs from the Organizer context', async () => {
    state.selectedEdition = 'edition-21';
    const config = schedule('edition-22', 'ssc22');
    expect(config.enabled).toBe(false);
    await expect(config.queryFn()).rejects.toThrow('exact selected Organizer edition');
    expect(state.fromCalls).toEqual([]);
  });

  it('fails closed on source errors instead of presenting a partial schedule', async () => {
    state.failureTable = 'jury_voting_windows';
    await expect(schedule('edition-22', 'ssc22').queryFn())
      .rejects.toThrow('Operational schedule could not be verified: jury voting.');
  });
});
