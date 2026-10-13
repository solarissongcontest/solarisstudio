import { describe, expect, it } from 'vitest';
import type { CountryIdentityModel } from './country-semantic-model';
import {
  buildV3CountryExploreProjection,
  buildV3EntryExploreProjection,
  buildV3ShowExploreProjection,
  V3_ARTIST_SONG_IDENTITY_POLICY,
} from './v3-explore-entities';

const country: CountryIdentityModel = {
  code: 'OLA',
  name: 'Oland',
  nativeName: 'Oland',
  region: 'North',
  description: 'A Solaris delegation.',
  flag: { src: '/oland.png', alt: 'Flag of Oland', aspectRatio: 1.5 },
  colors: { primary: '#111111', accent: '#d6a520' },
  facts: [],
  statistics: [],
  currentEntry: {
    editionId: 'edition-22',
    editionLabel: 'SSC 22',
    artist: 'Nera Vale',
    song: 'Further Review',
    placement: 1,
    status: 'published',
  },
  history: [
    {
      editionId: 'edition-21',
      editionLabel: 'SSC 21',
      artist: 'Earlier Artist',
      song: 'Earlier Song',
      placement: 2,
      points: 200,
      status: 'published',
    },
  ],
  actions: { wiki: { label: 'Wiki', href: '/countries/ola/wiki' } },
};

describe('V3 Explore entity projections', () => {
  it('keeps Country editorial/history context but leaves placements and points to Results', () => {
    const projection = buildV3CountryExploreProjection(country);

    expect(projection.currentEntry).toEqual({
      editionId: 'edition-22',
      editionLabel: 'SSC 22',
      artist: 'Nera Vale',
      song: 'Further Review',
      status: 'published',
    });
    expect(projection.participationHistory[0]).toEqual({
      editionId: 'edition-21',
      editionLabel: 'SSC 21',
      artist: 'Earlier Artist',
      song: 'Earlier Song',
      status: 'published',
    });
    expect(projection.resultsDestination).toBe('/results');
    expect('placement' in projection.participationHistory[0]).toBe(false);
    expect('points' in projection.participationHistory[0]).toBe(false);
  });

  it('builds a public Show running order without importing ranking data', () => {
    const projection = buildV3ShowExploreProjection({
      showId: 'final',
      editionId: 'edition-22',
      editionLabel: 'SSC 22',
      name: 'Grand Final',
      kind: 'grand-final',
      status: 'published',
      public: true,
      liveAvailable: false,
      resultsPublished: true,
      entries: [
        {
          entryId: 'entry-2',
          editionId: 'edition-22',
          editionLabel: 'SSC 22',
          countryId: 'b',
          countryName: 'B',
          artist: 'Artist B',
          song: 'Song B',
          status: 'published',
          showId: 'final',
          runningOrder: 2,
          public: true,
        },
        {
          entryId: 'entry-1',
          editionId: 'edition-22',
          editionLabel: 'SSC 22',
          countryId: 'a',
          countryName: 'A',
          artist: 'Artist A',
          song: 'Song A',
          status: 'published',
          showId: 'final',
          runningOrder: 1,
          public: true,
        },
        {
          entryId: 'private',
          editionId: 'edition-22',
          editionLabel: 'SSC 22',
          countryId: 'c',
          countryName: 'C',
          artist: 'Private',
          song: 'Private',
          status: 'draft',
          showId: 'final',
          runningOrder: 3,
          public: false,
        },
      ],
    });

    expect(projection.runningOrder.map((entry) => entry.entryId)).toEqual(['entry-1', 'entry-2']);
    expect(projection.results).toEqual({ available: true, destination: '/results' });
  });

  it('fails closed for private Show and Entry projections', () => {
    expect(() =>
      buildV3ShowExploreProjection({
        showId: 'private-show',
        editionId: 'edition-22',
        editionLabel: 'SSC 22',
        name: 'Private Show',
        kind: 'special',
        status: 'draft',
        public: false,
        liveAvailable: false,
        resultsPublished: false,
        entries: [],
      }),
    ).toThrow(/private show/);

    expect(() =>
      buildV3EntryExploreProjection({
        entryId: 'entry-private',
        editionId: 'edition-22',
        editionLabel: 'SSC 22',
        countryId: 'oland',
        countryName: 'Oland',
        artist: 'Artist',
        song: 'Song',
        status: 'draft',
        showId: null,
        showName: null,
        public: false,
      }),
    ).toThrow(/private entry/);
  });

  it('projects canonical Entry identity while keeping artist and song as attributes', () => {
    const projection = buildV3EntryExploreProjection({
      entryId: 'entry-1',
      editionId: 'edition-22',
      editionLabel: 'SSC 22',
      countryId: 'oland',
      countryName: 'Oland',
      artist: 'Same Name',
      song: 'A Song',
      status: 'published',
      showId: 'final',
      showName: 'Grand Final',
      artworkUrl: 'https://example.invalid/art.jpg',
      listeningUrl: 'https://example.invalid/listen',
      videoUrl: 'https://example.invalid/video',
      public: true,
    });

    expect(projection.id).toBe('entry-1');
    expect(projection.artist).toBe('Same Name');
    expect(projection.song).toBe('A Song');
    expect(projection.resultsDestination).toBe('/results');
  });

  it('does not authorize standalone Artist/Song routes before canonical entity IDs exist', () => {
    expect(V3_ARTIST_SONG_IDENTITY_POLICY).toEqual({
      canonicalArtistEntityAvailable: false,
      canonicalSongEntityAvailable: false,
      standaloneArtistRoutesAllowed: false,
      standaloneSongRoutesAllowed: false,
      detailOwner: 'entry',
    });
  });
});
