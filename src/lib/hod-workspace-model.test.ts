import { describe, expect, it } from 'vitest';
import { getCountryOperationalReadiness } from './country-operational-readiness';
import { evaluateEntryEligibility } from './eligibility-engine';
import { buildHodWorkspaceModel } from './hod-workspace-model';
import { evaluateWorkflow } from './workflow-engine';
import { entrySubmissionWorkflow } from './workflow-templates';

describe('HOD workspace model', () => {
  it('treats a missing HOD as the jury blocker', () => {
    const eligibility = evaluateEntryEligibility({
      countryConfirmed: true,
      artistName: '',
      songTitle: 'Song',
      videoUrl: null,
      artworkUrl: null,
      broadcasterApproved: false,
    });
    const workflow = evaluateWorkflow(entrySubmissionWorkflow());
    const operationalReadiness = getCountryOperationalReadiness({
      participationConfirmed: false,
      entryPresent: true,
      entryEligibility: eligibility,
      entryApproved: false,
      mediaAvailable: false,
      juryComplete: false,
      deadlines: [],
      unresolvedOrganizerIssues: 0,
    });

    const model = buildHodWorkspaceModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      countryId: 'oland',
      countryName: 'Oland',
      confirmationComplete: false,
      entryEligibility: eligibility,
      entryWorkflow: workflow,
      juryMembersRequired: 1,
      juryMembersAssigned: 0,
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
      operationalReadiness,
    });

    expect(model.actions[0].priority).toBe('critical');
    expect(model.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['confirmation', 'entry-blocked', 'jury-hod', 'official-notices']),
    );
    expect(model.actions.find((action) => action.id === 'jury-hod')).toMatchObject({
      label: 'Confirm HOD assignment',
      href: '/country-hub/hod',
    });
    expect(model.actions.find((action) => action.id === 'official-notices')?.href).toBe(
      '/country-hub/notices',
    );
    expect(model.outstandingAcknowledgements).toBe(1);
    expect(model.readiness).toBe(operationalReadiness.score);
    expect(model.readinessState).toBe('blocked');
  });

  it('moves directly from HOD assignment to the one country jury ballot', () => {
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
    const operationalReadiness = getCountryOperationalReadiness({
      participationConfirmed: true,
      entryPresent: true,
      entryEligibility: eligibility,
      entryApproved: true,
      mediaAvailable: true,
      juryComplete: true,
      deadlines: [],
      unresolvedOrganizerIssues: 0,
    });

    const pendingBallot = buildHodWorkspaceModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      countryId: 'oland',
      countryName: 'Oland',
      confirmationComplete: true,
      entryEligibility: eligibility,
      entryWorkflow: workflow,
      juryMembersRequired: 1,
      juryMembersAssigned: 1,
      juryBallotSubmitted: false,
      notices: [],
      operationalReadiness,
    });

    expect(pendingBallot.jury).toMatchObject({ assigned: 1, required: 1, complete: true });
    expect(pendingBallot.actions).toEqual([
      expect.objectContaining({
        id: 'jury-ballot',
        description: 'The HOD is assigned as the country’s jury, but the jury ballot has not been submitted.',
      }),
    ]);

    const complete = buildHodWorkspaceModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      countryId: 'oland',
      countryName: 'Oland',
      confirmationComplete: true,
      entryEligibility: eligibility,
      entryWorkflow: workflow,
      juryMembersRequired: 1,
      juryMembersAssigned: 1,
      juryBallotSubmitted: true,
      notices: [],
      operationalReadiness,
    });

    expect(complete.readiness).toBe(100);
    expect(complete.readinessState).toBe('ready');
    expect(complete.actions).toEqual([]);
  });
});
