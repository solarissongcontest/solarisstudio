import { describe, expect, it } from 'vitest';

import {
  calendarFilename,
  foldIcsLine,
  icsText,
  isCalendarSlug,
  parseCalendarStart,
  serializePublicCalendar,
  type PublicCalendarEdition,
  type PublicCalendarEvent,
} from './public-show-calendar';

const edition: PublicCalendarEdition = {
  id: 'edition-22', slug: 'ssc22', name: 'Solaris Song Contest 22', editionNumber: 22, year: 2026,
};
const show: PublicCalendarEvent = {
  id: '550e8400-e29b-41d4-a716-446655440000', editionId: edition.id,
  editionName: edition.name, name: 'Grand Final', kind: 'grand-final',
  startsAt: '2026-11-08T19:00:00.000Z', href: '/shows/550e8400-e29b-41d4-a716-446655440000',
};

describe('Public show calendar export', () => {
  it('rejects timezone-ambiguous and invalid show starts', () => {
    expect(parseCalendarStart('2026-11-08T19:00:00')).toBeNull();
    expect(parseCalendarStart('not a date')).toBeNull();
    expect(parseCalendarStart('2026-11-08T21:00:00+02:00')).toBe('2026-11-08T19:00:00.000Z');
    expect(parseCalendarStart(show.startsAt)).toBe(show.startsAt);
    expect(isCalendarSlug('../secret')).toBe(false);
    expect(isCalendarSlug('ssc22')).toBe(true);
  });

  it('produces a real RFC5545 text calendar without inventing an end time', () => {
    const calendar = serializePublicCalendar(edition, [show], '2026-11-04T10:00:00Z');
    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0/);
    expect(calendar).toContain('DTSTART:20261108T190000Z\r\n');
    expect(calendar).toContain('DTSTAMP:20261104T100000Z\r\n');
    expect(calendar).not.toContain('DTEND:');
    expect(calendar).toContain('SUMMARY:Grand Final · Solaris Song Contest 22');
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(calendarFilename(edition)).toBe('solaris-ssc22-shows.ics');
  });

  it('filters cross-edition/duplicate event IDs and never exports invalid dates', () => {
    const invalid = { ...show, id: 'foreign', editionId: 'different-edition' };
    const duplicate = { ...show, name: 'Injected duplicate row' };
    const absent = { ...show, id: 'other', startsAt: '2026-11-09T20:00:00' };
    const value = serializePublicCalendar(edition, [show, duplicate, invalid, absent], '2026-11-04T10:00:00Z');
    expect((value.match(/BEGIN:VEVENT/g) ?? [])).toHaveLength(1);
    expect(value).not.toContain('Injected duplicate row');
    expect(value).not.toContain('foreign');
  });

  it('escapes ICS text and folds Unicode lines by UTF-8 octet count', () => {
    expect(icsText('Song, Artist; A\\\\B\nLine2')).toBe('Song\\, Artist\\; A\\\\\\\\B\\nLine2');
    const folded = foldIcsLine('SUMMARY:' + 'Å'.repeat(60));
    expect(folded).toContain('\r\n ');
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(() => serializePublicCalendar(edition, [show], 'not-a-date')).toThrow('valid UTC');
  });
});
