import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-explore-entities.ts', import.meta.url), 'utf8');

describe('V3 Explore entity architecture boundary', () => {
  it('does not own data access, browser state or result analytics', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      'useQuery',
      'localStorage',
      'sessionStorage',
      'final_rank',
      'jury_points',
      'televote_points',
      'total_points',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('does not manufacture Artist/Song identity from display strings', () => {
    expect(source).not.toMatch(/\bslugify\s*\(/);
    expect(source).not.toContain('artistId');
    expect(source).not.toContain('songId');
    expect(source).toContain('standaloneArtistRoutesAllowed: false');
    expect(source).toContain('standaloneSongRoutesAllowed: false');
  });

  it('keeps result exploration routed to Results instead of embedding score data', () => {
    expect(source).toContain("resultsDestination: '/results'");
    expect(source).toContain("destination: '/results'");
  });
});
