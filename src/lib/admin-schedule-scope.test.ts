import { describe, expect, it } from 'vitest';
import {
  resolveOperationalScheduleEditionSlug,
  uniqueOperationalTelevoteRoundIds,
} from './admin-schedule-scope';

describe('Organizer operational schedule canonical edition scope', () => {
  const edition = { id: 'edition-22', slug: 'ssc22' };

  it('accepts the exact edition and its canonical slug', () => {
    expect(resolveOperationalScheduleEditionSlug(edition, 'edition-22', 'ssc22')).toBe('ssc22');
    expect(resolveOperationalScheduleEditionSlug(edition, 'edition-22')).toBe('ssc22');
    expect(resolveOperationalScheduleEditionSlug(edition, 'edition-22', ' ')).toBe('ssc22');
  });

  it('refuses a stale deep-link slug before fetching other workflows', () => {
    expect(() => resolveOperationalScheduleEditionSlug(edition, 'edition-22', 'ssc21'))
      .toThrow('does not match the selected edition');
  });

  it('refuses an edition ID mismatch or an absent edition', () => {
    expect(() => resolveOperationalScheduleEditionSlug(edition, 'edition-21', 'ssc22'))
      .toThrow('different edition');
    expect(() => resolveOperationalScheduleEditionSlug(null, 'edition-22', 'ssc22'))
      .toThrow('cannot verify');
  });

  it('rejects unsafe and malformed canonical slugs', () => {
    for (const slug of ['../other', 'ssc/22', '', ' SSC22', 'ssc22?preview=1', 42]) {
      expect(() => resolveOperationalScheduleEditionSlug({ id: 'edition-22', slug }, 'edition-22'))
        .toThrow('no valid canonical slug');
    }
  });

  it('deduplicates remote televote round IDs without inventing IDs', () => {
    expect(uniqueOperationalTelevoteRoundIds([
      { remote_round_id: 'r1' }, { remote_round_id: 'r2' },
      { remote_round_id: 'r1' }, { remote_round_id: null },
      {}, { remote_round_id: '' },
    ])).toEqual(['r1', 'r2']);
    expect(uniqueOperationalTelevoteRoundIds([])).toEqual([]);
  });
});
