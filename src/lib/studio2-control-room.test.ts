import { describe, expect, it, vi } from 'vitest';

import type { ContestEvent } from './contest-events';
import type { Studio2ControlRoomDataSource } from './studio2-control-room';
import { loadStudio2ControlRoomSnapshot } from './studio2-control-room';
import type { Studio2IncidentRecord, Studio2RuntimeRecord } from './studio2-persistence';

const timestamp = '2026-09-10T19:00:00.000Z';

const runtime: Studio2RuntimeRecord = {
  editionId: 'edition-1',
  runtime: {
    edition: 'televoting',
    subsystems: {
      confirmations: 'locked',
      submissions: 'locked',
      juryVoting: 'locked',
      televoting: 'open',
      results: 'not_started',
      predictions: 'locked',
    },
  },
  version: 7,
  createdAt: timestamp,
  updatedAt: timestamp,
  updatedBy: 'user-1',
};

const event: ContestEvent = {
  id: 'event-1',
  editionId: 'edition-1',
  type: 'televote.opened',
  occurredAt: timestamp,
  actorUserId: 'user-1',
  entityType: 'edition',
  entityId: 'edition-1',
  payload: {},
};

const incident: Studio2IncidentRecord = {
  id: 'incident-1',
  editionId: 'edition-1',
  title: 'Vote feed unavailable',
  severity: 'sev1',
  category: 'voting',
  status: 'mitigating',
  affectedSystems: ['televote'],
  description: 'Primary vote feed stopped responding.',
  commanderId: 'user-1',
  acknowledgedAt: timestamp,
  acknowledgedBy: 'user-1',
  resolution: null,
  postmortem: null,
  crisisDeclaredAt: timestamp,
  crisisDeclaredBy: 'user-1',
  startedAt: timestamp,
  resolvedAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: timestamp,
  updatedAt: timestamp,
};

function makeSource(overrides: Partial<Studio2ControlRoomDataSource> = {}): Studio2ControlRoomDataSource {
  return {
    loadEditionRuntime: vi.fn(async () => runtime),
    listEditionEvents: vi.fn(async () => [event]),
    listActiveIncidents: vi.fn(async () => [incident]),
    transitionEdition: vi.fn(async () => runtime),
    listTransitionApprovals: vi.fn(async () => []),
    requestTransitionApproval: vi.fn(async () => undefined),
    approveTransition: vi.fn(async () => undefined),
    createIncident: vi.fn(async () => incident),
    transitionIncident: vi.fn(async () => incident),
    ...overrides,
  };
}

describe('Studio 2 control room', () => {
  it('loads runtime, events and incidents into one operational snapshot', async () => {
    const source = makeSource();

    const snapshot = await loadStudio2ControlRoomSnapshot('edition-1', source, 25);

    expect(source.loadEditionRuntime).toHaveBeenCalledWith('edition-1');
    expect(source.listEditionEvents).toHaveBeenCalledWith('edition-1', 25);
    expect(source.listActiveIncidents).toHaveBeenCalledWith('edition-1');
    expect(snapshot.runtime).toEqual(runtime);
    expect(snapshot.recentEvents).toEqual([event]);
    expect(snapshot.incidents).toEqual([incident]);
    expect(snapshot.incidentSummary).toEqual({
      activeCount: 1,
      criticalCount: 1,
      crisisMode: true,
      highestSeverity: 'sev1',
    });
  });

  it('fails loudly when the edition runtime has not been provisioned', async () => {
    const source = makeSource({
      loadEditionRuntime: vi.fn(async () => null),
    });

    await expect(loadStudio2ControlRoomSnapshot('edition-missing', source)).rejects.toThrow(
      /Studio 2 runtime is unavailable/,
    );
  });

  it('does not enter crisis mode for lower-severity active incidents', async () => {
    const lowerSeverityIncident: Studio2IncidentRecord = {
      ...incident,
      id: 'incident-2',
      severity: 'sev2',
      status: 'monitoring',
    };
    const source = makeSource({
      listActiveIncidents: vi.fn(async () => [lowerSeverityIncident]),
    });

    const snapshot = await loadStudio2ControlRoomSnapshot('edition-1', source);

    expect(snapshot.incidentSummary.crisisMode).toBe(false);
    expect(snapshot.incidentSummary.highestSeverity).toBe('sev2');
  });
});
