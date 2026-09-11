import { describe, expect, it } from 'vitest';

import { evaluateEntryEligibility } from './eligibility-engine';
import { buildEntryReadinessModel } from './entry-readiness-model';
import { evaluateWorkflow } from './workflow-engine';
import { entrySubmissionWorkflow } from './workflow-templates';

describe('entry readiness model', () => {
  it('combines eligibility blockers with workflow dependencies', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: 'Artist',
      songTitle: '',
      videoUrl: 'https://example.com/video',
      artworkUrl: 'https://example.com/artwork',
      broadcasterApproved: false,
      duplicateEntryDetected: false,
      deadlinePassed: false,
    });
    const workflow = evaluateWorkflow(entrySubmissionWorkflow({
      'entry.song-info': 'pending',
      'entry.artist-info': 'completed',
      'entry.media': 'completed',
      'entry.eligibility': 'pending',
      'entry.broadcaster-approval': 'pending',
      'entry.tsbc-review': 'pending',
      'entry.lock': 'pending',
    }));

    const model = buildEntryReadinessModel(eligibility, workflow);

    expect(model.status).toBe('blocked');
    expect(model.blockerCount).toBeGreaterThan(0);
    expect(model.actions.some((action) => action.id === 'eligibility:song')).toBe(true);
    expect(model.actions.some((action) => action.id === 'eligibility:broadcaster-approval')).toBe(true);
  });

  it('surfaces workflow steps that can be worked now', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: 'Artist',
      songTitle: 'Song',
      videoUrl: 'https://example.com/video',
      artworkUrl: 'https://example.com/artwork',
      broadcasterApproved: true,
      duplicateEntryDetected: false,
      deadlinePassed: false,
    });
    const workflow = evaluateWorkflow(entrySubmissionWorkflow({
      'entry.song-info': 'completed',
      'entry.artist-info': 'completed',
      'entry.media': 'completed',
      'entry.eligibility': 'completed',
      'entry.broadcaster-approval': 'completed',
      'entry.tsbc-review': 'pending',
      'entry.lock': 'pending',
    }));

    const model = buildEntryReadinessModel(eligibility, workflow);

    expect(model.status).toBe('attention');
    expect(model.nextTaskIds).toContain('entry.tsbc-review');
    expect(model.actions.some((action) => action.id === 'workflow:entry.tsbc-review')).toBe(true);
  });

  it('is ready only when eligibility and required workflow are complete', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: 'Artist',
      songTitle: 'Song',
      videoUrl: 'https://example.com/video',
      artworkUrl: 'https://example.com/artwork',
      broadcasterApproved: true,
      duplicateEntryDetected: false,
      deadlinePassed: false,
    });
    const workflow = evaluateWorkflow(entrySubmissionWorkflow({
      'entry.song-info': 'completed',
      'entry.artist-info': 'completed',
      'entry.media': 'completed',
      'entry.eligibility': 'completed',
      'entry.broadcaster-approval': 'completed',
      'entry.tsbc-review': 'completed',
      'entry.lock': 'completed',
    }));

    const model = buildEntryReadinessModel(eligibility, workflow);

    expect(model.status).toBe('ready');
    expect(model.score).toBe(100);
    expect(model.actions).toEqual([]);
  });
});
