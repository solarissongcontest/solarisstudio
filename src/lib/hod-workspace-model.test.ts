import { describe, expect, it } from 'vitest';
import { evaluateEntryEligibility } from './eligibility-engine';
import { buildHodWorkspaceModel } from './hod-workspace-model';
import { evaluateWorkflow } from './workflow-engine';
import { entrySubmissionWorkflow } from './workflow-templates';

describe('HOD workspace model', () => {
  it('prioritizes blockers and acknowledgement requirements', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: '',
      songTitle: 'Song',
      videoUrl: null,
      artworkUrl: null,
      broadcasterApproved: false,
    });
    const workflow = evaluateWorkflow(entrySubmissionWorkflow());

    const model = buildHodWorkspaceModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      countryId: 'oland',
      countryName: 'Oland',
      confirmationComplete: false,
      entryEligibility: eligibility,
      entryWorkflow: workflow,
      juryMembersRequired: 5,
      juryMembersAssigned: 3,
      juryBallotSubmitted: false,
      notices: [
        {
          id: 'notice-1',
          title: 'Rule clarification',
          severity: 'critical',
          acknowledgementRequired: true,
          acknowledged: false,
        },
      ],
    });

    expect(model.actions[0].priority).toBe('critical');
    expect(model.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['confirmation', 'entry-blocked', 'jury-members', 'official-notices']),
    );
    expect(model.actions.find((action) => action.id === 'official-notices')?.href).toBe(
      '/country-hub/notices',
    );
    expect(model.outstandingAcknowledgements).toBe(1);
    expect(model.readiness).toBeLessThan(50);
  });

  it('becomes clear when delegation requirements are complete', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: 'Artist',
      songTitle: 'Song',
      videoUrl: 'https://example.com/video',
      artworkUrl: 'https://example.com/artwork.jpg',
      broadcasterApproved: true,
    });
    const workflow = evaluateWorkflow(
      entrySubmissionWorkflow({
        'entry.song-info': 'completed',
        'entry.artist-info': 'completed',
        'entry.media': 'completed',
        'entry.eligibility': 'completed',
        'entry.broadcaster-approval': 'completed',
        'entry.tsbc-review': 'completed',
        'entry.lock': 'completed',
      }),
    );

    const model = buildHodWorkspaceModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      countryId: 'oland',
      countryName: 'Oland',
      confirmationComplete: true,
      entryEligibility: eligibility,
      entryWorkflow: workflow,
      juryMembersRequired: 5,
      juryMembersAssigned: 5,
      juryBallotSubmitted: true,
      notices: [],
    });

    expect(model.readiness).toBe(100);
    expect(model.actions).toEqual([]);
  });
});
