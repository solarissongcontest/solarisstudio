import { createConfirmationPublicRuntimeClient } from '@/integrations/confirmations/public-runtime.server';
import { isShowPublic } from '@/lib/publication';
import { showModeConfig } from '@/lib/show-mode';
import {
  isCalendarSlug,
  parseCalendarStart,
  type PublicCalendarData,
  type PublicCalendarEdition,
  type PublicCalendarEvent,
} from '@/lib/public-show-calendar';

type ReadResult = { data: unknown; error: unknown };
type Query = {
  eq(field: string, value: unknown): Query;
  order(column: string, opts?: { ascending?: boolean }): Query;
  limit(value: number): PromiseLike<ReadResult>;
  maybeSingle(): PromiseLike<ReadResult>;
  then<TResult1 = ReadResult, TResult2 = never>(
    onfulfilled?: ((value: ReadResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
export type CalendarReader = {
  from(table: 'editions' | 'shows'): { select(fields: string): Query };
};

function fail(error: unknown, scope: string) {
  if (error) throw new Error('Could not verify ' + scope + '.');
}
function parseEdition(value: unknown): PublicCalendarEdition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.published !== true || typeof row.id !== 'string' ||
    !isCalendarSlug(row.slug) || typeof row.name !== 'string' || !row.name.trim()) return null;
  const editionNumber = row.edition_number;
  const year = row.year;
  return {
    id: row.id, slug: row.slug, name: row.name.trim(),
    editionNumber: typeof editionNumber === 'number' && Number.isSafeInteger(editionNumber) ? editionNumber : null,
    year: typeof year === 'number' && Number.isSafeInteger(year) ? year : null,
  };
}
function parseShow(value: unknown, edition: PublicCalendarEdition): PublicCalendarEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.published !== true || row.edition_id !== edition.id ||
      typeof row.id !== 'string' || typeof row.name !== 'string' || !row.name.trim()) return null;
  // The Show's canonical publication configuration owns visibility.
  if (!isShowPublic({
    published: row.published,
    publication_config: row.publication_config as Record<string, unknown> | null,
  })) return null;
  const startsAt = parseCalendarStart(showModeConfig({
    broadcast_config: row.broadcast_config as Record<string, unknown> | null,
  }).scheduledStart);
  if (!startsAt) return null;
  return {
    id: row.id, editionId: edition.id, editionName: edition.name,
    name: row.name.trim(), kind: typeof row.kind === 'string' ? row.kind : 'show',
    startsAt, href: '/shows/' + encodeURIComponent(row.id),
  };
}

// Fresh anonymous public reader: no service-role key or privileged queries.
export async function loadPublicShowCalendar(
  slug: string | null,
  reader: CalendarReader = createConfirmationPublicRuntimeClient() as unknown as CalendarReader,
  now: () => string = () => new Date().toISOString(),
): Promise<PublicCalendarData> {
  if (slug !== null && !isCalendarSlug(slug)) {
    return { editions: [], edition: null, events: [], generatedAt: now() };
  }
  const editionRows = await reader.from('editions')
    .select('id,slug,name,edition_number,year,published')
    .eq('published', true)
    .order('edition_number', { ascending: false })
    .limit(24);
  fail(editionRows.error, 'published editions');
  if (!Array.isArray(editionRows.data)) throw new Error('Invalid edition calendar response.');
  const editions = editionRows.data.map(parseEdition)
    .filter((item): item is PublicCalendarEdition => item !== null);
  let selected = slug ? editions.find((edition) => edition.slug === slug) ?? null : editions[0] ?? null;
  if (slug && !selected) {
    const result = await reader.from('editions')
      .select('id,slug,name,edition_number,year,published')
      .eq('slug', slug).eq('published', true).maybeSingle();
    fail(result.error, 'requested edition');
    selected = parseEdition(result.data);
    if (selected) editions.push(selected);
  }
  if (!selected) return { editions, edition: null, events: [], generatedAt: now() };
  const showRows = await reader.from('shows')
    .select('id,edition_id,name,kind,published,publication_config,broadcast_config,sort_order')
    .eq('edition_id', selected.id)
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .limit(100);
  fail(showRows.error, 'public show schedule');
  if (!Array.isArray(showRows.data)) throw new Error('Invalid public show schedule.');
  const events = showRows.data
    .map((value) => parseShow(value, selected))
    .filter((event): event is PublicCalendarEvent => event !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.name.localeCompare(b.name));
  return { editions, edition: selected, events, generatedAt: now() };
}
