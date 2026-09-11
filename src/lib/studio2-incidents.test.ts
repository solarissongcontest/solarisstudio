import { describe, expect, it } from 'vitest';

import type { ContestEvent } from './contest-events';
import type { Studio2IncidentRecord } from './studio2-persistence';
import {
  availableIncidentTransitions,
  buildIncidentCommandModel,
  filterStudio2Incidents,
  incidentTimeline,
} from './studio2-incidents';

const base: Studio2IncidentRecord = {
  id: 'incident-1',
  editionId: 'edition-1',
  title: 'Televote unavailable',
  severity: 'sev1',
  category: 'voting',
  status: 'open',
  affectedSystems: ['televote'],
  description: 'Primary voting endpoint is unavailable.',
  commanderId: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolution: null,
  postmortem: null,
  crisisDeclaredAt: null,
  crisisDeclaredBy: null,
  startedAt: '2026-09-11T18:00:00.000Z',
  resolvedAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: '2026-09-11T18:00:00.000Z',
  updatedAt: '2026-09-11T18:00:00.000Z',
};

describe('Studio 2 Incident Command model', () => {
  it('prioritizes active severe incidents and summarizes command state', () => {
    const resolved: Studio2IncidentRecord = {
      ...base,
      id: 'incident-2',
      severity: 'sev3',
      status: 'resolved',
      acknowledgedAt: '2026-09-11T18:10:00.000Z',
      resolvedAt: '2026-09-11T18:20:00.000Z',
    };
    const model = buildIncidentCommandModel([resolved, base]);

    expect(model.incidents[0].id).toBe('incident-1');
    expect(model.metrics).toEqual({
      active: 1,
      critical: 1,
      unacknowledged: 1,
      crisis: 1,
      resolved: 1,
    });
  });

  it('filters by lifecycle, severity, category, acknowledgement and text', () => {
    const incidents = [base, { ...base, id: 'incident-2', severity: 'sev3' as const, category: 'broadcast' as const, acknowledgedAt: '2026-09-11T18:10:00.000Z' }];
    expect(filterStudio2Incidents(incidents, { severity: 'sev1' })).toHaveLength(1);
    expect(filterStudio2Incidents(incidents, { category: 'broadcast' })).toHaveLength(1);
    expect(filterStudio2Incidents(incidents, { acknowledged: 'no' })).toHaveLength(1);
    expect(filterStudio2Incidents(incidents, { q: 'primary voting' })).toHaveLength(2);
  });

  it('exposes legal transitions including controlled reopen', () => {
    expect(availableIncidentTransitions('open')).toEqual(['mitigating', 'monitoring', 'resolved']);
    expect(availableIncidentTransitions('resolved')).toEqual(['monitoring']);
  });

  it('builds an incident-only timeline and preserves operator notes', () => {
    const events: ContestEvent[] = [
      {
        id: 'event-1',
        editionId: 'edition-1',
        type: 'incident.updated',
        occurredAt: '2026-09-11T18:05:00.000Z',
        actorUserId: 'user-2',
        entityType: 'incident',
        entityId: 'incident-1',
        payload: { action: 'timeline_note', message: 'Failover route activated.' },
      },
      {
        id: 'event-2',
        editionId: 'edition-1',
        type: 'incident.created',
        occurredAt: '2026-09-11T18:00:00.000Z',
        actorUserId: 'user-1',
        entityType: 'incident',
        entityId: 'incident-1',
        payload: {},
      },
      {
        id: 'event-other',
        editionId: 'edition-1',
        type: 'incident.created',
        occurredAt: '2026-09-11T18:01:00.000Z',
        actorUserId: 'user-3',
        entityType: 'incident',
        entityId: 'incident-2',
        payload: {},
      },
    ];

    const timeline = incidentTimeline(events, 'incident-1');
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ action: 'timeline_note', message: 'Failover route activated.' });
  });
});
