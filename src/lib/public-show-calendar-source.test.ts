import { describe, expect, it } from 'vitest';
import { loadPublicShowCalendar, type CalendarReader } from '@/integrations/v3/public-show-calendar.server';

const edition = { id: 'edition-22', slug: 'ssc22', name: 'SSC 22', edition_number: 22, year: 2026, published: true };
const show = {
  id: 'show-22', edition_id: 'edition-22', name: 'Grand Final', kind: 'grand-final',
  published: true,
  // Public schedule may be shown only if publication_config allows any public layer.
  publication_config: { participants: true },
  broadcast_config: { showMode: { scheduledStart: '2026-11-08T19:00:00.000Z' } },
};

function reader(editions: unknown, shows: unknown, exactEdition: unknown = null) {
  const calls: string[] = [];
  let editionCalls = 0;
  const client = {
    from(table: string) {
      calls.push('from:' + table);
      return {
        select(columns: string) {
          calls.push('select:' + columns);
          const query = {
            eq(field: string, value: unknown) { calls.push('eq:' + field + '=' + String(value)); return query; },
            order(field: string) { calls.push('order:' + field); return query; },
            limit(value: number) {
              calls.push('limit:' + value);
              if (table === 'editions') { editionCalls++; return Promise.resolve({ data: editions, error: null }); }
              return Promise.resolve({ data: shows, error: null });
            },
            maybeSingle() { return Promise.resolve({ data: exactEdition, error: null }); },
          };
          return query;
        },
      };
    },
  };
  return { client: client as unknown as CalendarReader, calls, getEditionCalls: () => editionCalls };
}

describe('Publication-safe show calendar projection', () => {
  it('makes bounded narrow reads and keeps unknown show times out', async () => {
    const mock = reader([edition], [
      { ...show, broadcast_config: null },
      { ...show, id: 'show-22b', broadcast_config: { showMode: { scheduledStart: '2026-11-08T19:00:00' } } },
    ]);
    const data = await loadPublicShowCalendar('ssc22', mock.client, () => '2026-11-04T08:00:00.000Z');
    expect(data.edition?.slug).toBe('ssc22');
    expect(data.events).toEqual([]);
    expect(mock.calls).toContain('limit:24');
    expect(mock.calls).toContain('limit:100');
    expect(mock.calls).toContain('eq:published=true');
    expect(mock.calls.find((call) => call.startsWith('select:id,edition_id'))).not.toContain('results');
  });

  it('does not query Show when the edition is unpublished or slug malformed', async () => {
    const mock = reader([{ ...edition, published: false }], []);
    const absent = await loadPublicShowCalendar('ssc22', mock.client);
    expect(absent.edition).toBeNull();
    expect(mock.calls.filter((call) => call === 'from:shows')).toHaveLength(0);
    const before = mock.calls.length;
    expect((await loadPublicShowCalendar('../private', mock.client)).events).toEqual([]);
    expect(mock.calls.length).toBe(before);
  });

  it('includes only publication-safe scheduled shows with authoritative UTC times', async () => {
    const mock = reader([edition], [
      show,
      { ...show, id: 'hidden', publication_config: { participants: false } },
      { ...show, id: 'unpublished', published: false },
      { ...show, id: 'other-edition', edition_id: 'unrelated' },
    ]);
    const data = await loadPublicShowCalendar('ssc22', mock.client);
    expect(data.events).toEqual([expect.objectContaining({
      id: 'show-22',
      editionId: 'edition-22',
      startsAt: '2026-11-08T19:00:00.000Z',
    })]);
    expect(mock.calls).toContain('eq:edition_id=edition-22');
  });

  it('does not guess missing schedule data and safely selects a published edition', async () => {
    const mock = reader([edition], [{ ...show, published: false }]);
    const data = await loadPublicShowCalendar(null, mock.client);
    expect(data.edition?.slug).toBe('ssc22');
    expect(data.events).toHaveLength(0);
    expect(data.generatedAt).toBeTruthy();
  });

  it('fails closed if public visibility cannot be verified', async () => {
    const mock = reader([edition], { error: 'not-an-array' });
    await expect(loadPublicShowCalendar(null, mock.client)).rejects.toThrow('Invalid public show schedule.');
  });
});
