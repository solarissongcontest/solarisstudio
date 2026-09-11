import { describe, expect, it } from 'vitest';
import { buildControlRoomModel } from './control-room-model';

describe('control room model', () => {
  it('derives a safe legacy runtime state before persistence is available', () => {
    const model = buildControlRoomModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      legacyEditionStatus: 'voting',
      ballotsReceived: 18,
      ballotsExpected: 24,
    });

    expect(model.editionState).toBe('televoting');
    expect(model.subsystems.televoting).toBe('open');
    expect(model.ballots.completion).toBe(75);
    expect(model.actions.map((item) => item.id)).toContain('close-televote');
  });

  it('raises control room health when incidents or critical readiness issues exist', () => {
    expect(
      buildControlRoomModel({
        editionId: 'ssc21',
        editionName: 'SSC 21',
        legacyEditionStatus: 'active',
        activeIncidents: 1,
      }).overallHealth,
    ).toBe('attention');

    expect(
      buildControlRoomModel({
        editionId: 'ssc21',
        editionName: 'SSC 21',
        legacyEditionStatus: 'active',
        criticalIssues: 1,
      }).overallHealth,
    ).toBe('critical');
  });

  it('prefers explicit runtime state over legacy edition status', () => {
    const model = buildControlRoomModel({
      editionId: 'ssc21',
      editionName: 'SSC 21',
      legacyEditionStatus: 'active',
      runtimeState: {
        edition: 'vote_verification',
        subsystems: {
          confirmations: 'locked',
          submissions: 'locked',
          juryVoting: 'locked',
          televoting: 'locked',
          results: 'not_started',
          predictions: 'locked',
        },
      },
    });

    expect(model.editionState).toBe('vote_verification');
    expect(model.actions.map((item) => item.id)).toEqual(['verify-results', 'reopen-televote']);
  });
});
