import { describe, expect, it } from 'vitest';
import { evaluateWorkflow } from './workflow-engine';
import { entrySubmissionWorkflow, hostTransferWorkflow, liveShowReadinessWorkflow } from './workflow-templates';

describe('contest workflow templates', () => {
  it('unlocks eligibility only after required entry metadata and media exist', () => {
    const summary = evaluateWorkflow(
      entrySubmissionWorkflow({
        'entry.song-info': 'completed',
        'entry.artist-info': 'completed',
        'entry.media': 'completed',
      }),
    );

    expect(summary.nextTaskIds).toEqual(['entry.eligibility']);
  });

  it('keeps host broadcast integration blocked until production and brand are ready', () => {
    const summary = evaluateWorkflow(
      hostTransferWorkflow({
        'host.acceptance': 'completed',
        'host.city': 'completed',
        'host.venue': 'completed',
        'host.dates': 'completed',
        'host.production': 'completed',
      }),
    );

    expect(summary.tasks.find((task) => task.id === 'host.broadcast')?.effectiveStatus).toBe('blocked');
    expect(summary.nextTaskIds).toContain('host.brand');
  });

  it('requires both operational and broadcast readiness before go-live', () => {
    const summary = evaluateWorkflow(
      liveShowReadinessWorkflow({
        'show.lineup': 'completed',
        'show.assets': 'completed',
        'show.jury': 'completed',
        'show.televote': 'completed',
        'show.results': 'completed',
        'show.rundown': 'completed',
      }),
    );

    expect(summary.nextTaskIds).toEqual(['show.go']);
  });
});
