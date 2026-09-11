import { describe, expect, it } from 'vitest';
import { evaluateEntryEligibility } from './eligibility-engine';

describe('entry eligibility engine', () => {
  it('marks a complete eligible entry ready', () => {
    const result = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: 'Artist',
      songTitle: 'Song',
      videoUrl: 'https://example.com/video',
      artworkUrl: 'https://example.com/artwork.jpg',
      broadcasterApproved: true,
      duplicateEntryDetected: false,
      deadlinePassed: false,
    });

    expect(result.status).toBe('ready');
    expect(result.score).toBe(100);
    expect(result.blockers).toEqual([]);
  });

  it('blocks missing required information and late submissions', () => {
    const result = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: '',
      songTitle: 'Song',
      videoUrl: null,
      artworkUrl: null,
      broadcasterApproved: false,
      deadlinePassed: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers.map((check) => check.id)).toEqual(
      expect.arrayContaining(['artist', 'video', 'artwork', 'broadcaster-approval', 'deadline']),
    );
  });

  it('supports rule changes without rewriting the validator', () => {
    const result = evaluateEntryEligibility(
      {
        countryConfirmed: true,
        artistName: 'Artist',
        songTitle: 'Song',
        videoUrl: null,
        artworkUrl: 'https://example.com/artwork.jpg',
        broadcasterApproved: true,
        durationSeconds: 190,
        duplicateEntryDetected: true,
      },
      {
        requireVideo: false,
        requireArtwork: true,
        requireBroadcasterApproval: true,
        maxDurationSeconds: 180,
        blockDuplicates: false,
      },
    );

    expect(result.blockers.map((check) => check.id)).toContain('duration');
    expect(result.warnings.map((check) => check.id)).toContain('duplicate');
  });
});
