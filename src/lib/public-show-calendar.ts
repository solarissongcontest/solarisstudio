// Public calendar rows must come from published Edition + Show state.
// This module does not infer official show progression or construct start times.
export type PublicCalendarEdition = {
  id: string;
  slug: string;
  name: string;
  editionNumber: number | null;
  year: number | null;
};

export type PublicCalendarEvent = {
  id: string;
  editionId: string;
  editionName: string;
  name: string;
  kind: string;
  startsAt: string;
  href: string;
};

export type PublicCalendarData = {
  editions: PublicCalendarEdition[];
  edition: PublicCalendarEdition | null;
  events: PublicCalendarEvent[];
  generatedAt: string;
};

const UTC_OR_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;

export function parseCalendarStart(value: unknown): string | null {
  if (typeof value !== 'string' || !UTC_OR_OFFSET.test(value.trim())) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function isCalendarSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value);
}

function calendarTimestamp(date: string) {
  return date.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// RFC 5545 TEXT escaping. No HTML or untrusted URL content in exported fields.
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

// A content line must be at most 75 UTF-8 octets, not 75 JS code units.
// Continue with one SPACE, counted in the following folded line.
export function foldIcsLine(value: string): string {
  let line = '';
  let bytes = 0;
  const parts: string[] = [];
  const encoder = new TextEncoder();
  for (const symbol of value) {
    const n = encoder.encode(symbol).length;
    if (bytes + n > 75 && line) {
      parts.push(line);
      line = ' ';
      bytes = 1;
    }
    line += symbol;
    bytes += n;
  }
  if (line) parts.push(line);
  return parts.join('\r\n');
}

export function serializePublicCalendar(
  edition: PublicCalendarEdition,
  events: readonly PublicCalendarEvent[],
  generatedAt: string,
): string {
  const stamp = parseCalendarStart(generatedAt);
  if (!stamp) throw new Error('Cannot export without a valid UTC timestamp.');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Solaris Studio//Published Show Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(edition.name + ' published shows'),
    'X-WR-TIMEZONE:UTC',
  ];
  const unique = new Set<string>();
  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))) {
    if (event.editionId !== edition.id || unique.has(event.id) || !/^[a-zA-Z0-9-]{1,100}$/.test(event.id)) continue;
    const startsAt = parseCalendarStart(event.startsAt);
    if (!startsAt) continue;
    unique.add(event.id);
    lines.push(
      'BEGIN:VEVENT',
      'UID:solaris-show-' + event.id + '@studio.solaris-song-contest.workers.dev',
      'DTSTAMP:' + calendarTimestamp(stamp),
      'DTSTART:' + calendarTimestamp(startsAt),
      'SUMMARY:' + icsText(event.name + ' · ' + edition.name),
      'DESCRIPTION:' + icsText('Public scheduled start. Times may change. Verify the latest show time in Solaris Studio.'),
      'URL:https://studio.solaris-song-contest.workers.dev/shows/' + encodeURIComponent(event.id),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function calendarFilename(edition: PublicCalendarEdition) {
  return 'solaris-' + (isCalendarSlug(edition.slug) ? edition.slug : 'edition') + '-shows.ics';
}
