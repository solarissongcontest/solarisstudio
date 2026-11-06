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

  it('does not claim healthy status when incident or health evidence is unavailable', () => {
    const base = {
      editionId: 'ssc22',
      editionName: 'SSC 22',
      healthStatus: 'ready' as const,
      healthIssues: 0,
      criticalIssues: 0,
    };
    expect(buildControlRoomModel(base).overallHealth).toBe('unknown');
    expect(buildControlRoomModel({
      ...base, activeIncidents: 0, criticalIncidents: 0,
    }).overallHealth).toBe('healthy');
    expect(buildControlRoomModel({
      ...base, healthStatus: null, activeIncidents: 0, criticalIncidents: 0,
    }).overallHealth).toBe('unknown');
  });

  it('prioritizes verified operational incident severity over otherwise healthy edition status', () => {
    const base = {
      editionId: 'ssc22',
      editionName: 'SSC 22',
      healthStatus: 'ready' as const,
      healthIssues: 0,
      criticalIssues: 0,
      activeIncidents: 2,
      criticalIncidents: 1,
    };
    expect(buildControlRoomModel(base).overallHealth).toBe('critical');
    expect(buildControlRoomModel({
      ...base, criticalIncidents: 0,
    }).overallHealth).toBe('attention');
  });

  it('does not present unreadable incident counts as verified zero', () => {
    const unknown = buildControlRoomModel({
      editionId: 'ssc22', editionName: 'SSC22',
      healthStatus: 'ready', healthIssues: 0, criticalIssues: 0,
    });
    expect(unknown.issues.incidents).toBeNull();
    expect(unknown.issues.criticalIncidents).toBeNull();
    expect(unknown.overallHealth).toBe('unknown');

    const verifiedClean = buildControlRoomModel({
      editionId: 'ssc22', editionName: 'SSC22',
      healthStatus: 'ready', healthIssues: 0, criticalIssues: 0,
      activeIncidents: 0, criticalIncidents: 0,
    });
    expect(verifiedClean.issues.incidents).toBe(0);
    expect(verifiedClean.issues.criticalIncidents).toBe(0);
    expect(verifiedClean.overallHealth).toBe('healthy');
  });
});
