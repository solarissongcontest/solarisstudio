import { describe, expect, it } from 'vitest';

import {
  diffConfirmationSnapshots,
  formatConfirmationVersionSource,
  formatConfirmationVersionValue,
  projectConfirmationSnapshot,
} from './confirmation-version-history';

describe('confirmation version history', () => {
  it('projects only contest-operational fields from legacy snapshots', () => {
    const projected = projectConfirmationSnapshot({
      submission: {
        participating: true,
        selection_method: 'internal',
        entry_unknown: false,
        initial_ip: '192.0.2.1',
        latest_ip: '192.0.2.2',
        recovery_code: 'secret',
        browser_session_id: 'browser-secret',
      },
      internal: {
        artist: 'Artist',
        song_title: 'Song',
        song_url: 'https://example.com/song',
      },
    });

    expect(projected).toMatchObject({
      participating: true,
      selectionMethod: 'internal',
      internalArtist: 'Artist',
      internalSong: 'Song',
    });
    expect(JSON.stringify(projected)).not.toContain('192.0.2.1');
    expect(JSON.stringify(projected)).not.toContain('secret');
    expect(projected).not.toHaveProperty('initial_ip');
    expect(projected).not.toHaveProperty('recovery_code');
  });

  it('reports semantic field changes between pre-edit and later state', () => {
    const changes = diffConfirmationSnapshots(
      {
        submission: { participating: true, selection_method: 'internal' },
        internal: { artist: 'Old Artist', song_title: 'Old Song' },
      },
      {
        submission: { participating: true, selection_method: 'internal' },
        internal: { artist: 'New Artist', song_title: 'New Song' },
      },
    );

    expect(changes.map((change) => change.label)).toEqual(['Artist', 'Song title']);
  });

  it('formats values for an organizer instead of dumping nulls', () => {
    expect(formatConfirmationVersionValue(null)).toBe('Not set');
    expect(formatConfirmationVersionValue(true)).toBe('Yes');
    expect(formatConfirmationVersionValue(false)).toBe('No');
    expect(formatConfirmationVersionValue([{ artist: 'A', song: 'B' }])).toBe('A — B');
  });

  it('labels version provenance in organizer language', () => {
    expect(formatConfirmationVersionSource('organizer_restore')).toBe('Before organizer restore');
    expect(formatConfirmationVersionSource('delegate_edit')).toBe('Before delegation edit');
    expect(formatConfirmationVersionSource('legacy_edit')).toBe('Legacy edit');
    expect(formatConfirmationVersionSource(null)).toBe('Legacy edit');
  });
});
