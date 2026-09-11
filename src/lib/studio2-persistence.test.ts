import { describe, expect, it } from 'vitest';

import {
  mapStudio2CapabilityGrantRow,
  mapStudio2EventRow,
  mapStudio2IncidentRow,
  mapStudio2RuntimeRow,
} from './studio2-persistence';

const timestamp = '2026-09-10T19:00:00.000Z';

describe('Studio 2 persistence row mapping', () => {
  it('maps an edition runtime row into the domain shape', () => {
    expect(
      mapStudio2RuntimeRow({
        edition_id: 'edition-1',
        state: 'televoting',
        subsystems: {
          confirmations: 'locked',
          submissions: 'locked',
          juryVoting: 'locked',
          televoting: 'open',
          results: 'not_started',
          predictions: 'locked',
        },
        version: 7,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: 'user-1',
      }),
    ).toEqual({
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
    });
  });

  it('rejects unknown lifecycle and subsystem states', () => {
    expect(() =>
      mapStudio2RuntimeRow({
        edition_id: 'edition-1',
        state: 'banana',
        subsystems: {},
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: null,
      }),
    ).toThrow(/Unknown Studio 2 edition state/);

    expect(() =>
      mapStudio2RuntimeRow({
        edition_id: 'edition-1',
        state: 'planning',
        subsystems: {
          confirmations: 'floating',
          submissions: 'not_started',
          juryVoting: 'not_started',
          televoting: 'not_started',
          results: 'not_started',
          predictions: 'not_started',
        },
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: null,
      }),
    ).toThrow(/Unknown subsystem state/);
  });

  it('maps event and full incident rows', () => {
    expect(
      mapStudio2EventRow({
        id: 'event-1',
        edition_id: 'edition-1',
        type: 'edition.state_changed',
        occurred_at: timestamp,
        actor_user_id: 'user-1',
        entity_type: 'edition',
        entity_id: 'edition-1',
        payload: { from: 'planning', to: 'confirmations' },
      }),
    ).toMatchObject({
      id: 'event-1',
      editionId: 'edition-1',
      type: 'edition.state_changed',
      actorUserId: 'user-1',
    });

    expect(
      mapStudio2IncidentRow({
        id: 'incident-1',
        edition_id: 'edition-1',
        title: 'Vote feed unavailable',
        severity: 'sev1',
        category: 'voting',
        status: 'mitigating',
        affected_systems: ['televote', 'results'],
        description: 'Primary vote feed stopped responding.',
        commander_id: 'user-3',
        acknowledged_at: timestamp,
        acknowledged_by: 'user-2',
        resolution: null,
        postmortem: null,
        crisis_declared_at: timestamp,
        crisis_declared_by: 'user-3',
        started_at: timestamp,
        resolved_at: null,
        created_by: 'user-1',
        updated_by: 'user-2',
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toMatchObject({
      id: 'incident-1',
      editionId: 'edition-1',
      severity: 'sev1',
      category: 'voting',
      status: 'mitigating',
      affectedSystems: ['televote', 'results'],
      commanderId: 'user-3',
      acknowledgedBy: 'user-2',
      crisisDeclaredBy: 'user-3',
    });
  });

  it('keeps old incident rows readable while the schema migration rolls out', () => {
    expect(
      mapStudio2IncidentRow({
        id: 'incident-legacy',
        edition_id: 'edition-1',
        title: 'Legacy incident',
        severity: 'sev3',
        status: 'open',
        started_at: timestamp,
        resolved_at: null,
        created_by: null,
        updated_by: null,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toMatchObject({
      category: 'other',
      affectedSystems: [],
      description: '',
      commanderId: null,
      acknowledgedAt: null,
    });
  });

  it('rejects unknown event, incident, and capability values', () => {
    expect(() =>
      mapStudio2EventRow({
        id: 'event-1',
        edition_id: 'edition-1',
        type: 'edition.exploded',
        occurred_at: timestamp,
        actor_user_id: null,
        entity_type: null,
        entity_id: null,
        payload: {},
      }),
    ).toThrow(/Unknown contest event type/);

    expect(() =>
      mapStudio2IncidentRow({
        id: 'incident-1',
        edition_id: null,
        title: 'Strange incident',
        severity: 'sev0',
        status: 'open',
        started_at: timestamp,
        resolved_at: null,
        created_by: null,
        updated_by: null,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toThrow(/Unknown incident severity/);

    expect(() =>
      mapStudio2IncidentRow({
        id: 'incident-2',
        edition_id: null,
        title: 'Unknown category',
        severity: 'sev4',
        category: 'weather',
        status: 'open',
        started_at: timestamp,
        resolved_at: null,
        created_by: null,
        updated_by: null,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toThrow(/Unknown incident category/);

    expect(() =>
      mapStudio2CapabilityGrantRow({
        id: 'grant-1',
        user_id: 'user-1',
        capability: 'results.launch_missiles',
        edition_id: 'edition-1',
        expires_at: null,
        granted_by: 'organizer-1',
        created_at: timestamp,
      }),
    ).toThrow(/Unknown Solaris capability/);
  });

  it('maps a valid scoped capability grant', () => {
    expect(
      mapStudio2CapabilityGrantRow({
        id: 'grant-1',
        user_id: 'user-1',
        capability: 'results.verify',
        edition_id: 'edition-1',
        expires_at: null,
        granted_by: 'organizer-1',
        created_at: timestamp,
      }),
    ).toEqual({
      id: 'grant-1',
      userId: 'user-1',
      capability: 'results.verify',
      editionId: 'edition-1',
      expiresAt: null,
      grantedBy: 'organizer-1',
      createdAt: timestamp,
    });
  });
});
