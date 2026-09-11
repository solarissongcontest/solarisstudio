import { describe, expect, it } from 'vitest';
import { getCountryOperationalReadiness } from './country-operational-readiness';
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
      operationalReadiness,
    });

    expect(model.actions[0].priority).toBe('critical');
    expect(model.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['confirmation', 'entry-blocked', 'jury-members', 'official-notices']),
    );
    expect(model.actions.find((action) => action.id === 'official-notices')?.href).toBe(
      '/country-hub/notices',
    );
    expect(model.outstandingAcknowledgements).toBe(1);
    expect(model.readiness).toBe(operationalReadiness.score);
    expect(model.readinessState).toBe('blocked');
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
      operationalReadiness,
    });

    expect(model.readiness).toBe(100);
    expect(model.readinessState).toBe('ready');
    expect(model.actions).toEqual([]);
  });
});
