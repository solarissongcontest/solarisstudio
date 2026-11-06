import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@/integrations/supabase/capabilities.server', () => ({
  requireSolarisCapabilityServer: mocked.requireCapability,
}));
vi.mock('@/integrations/supabase/organizer.server', () => ({
  createSolarisAuthenticatedClientServer: mocked.createClient,
}));

import { loadControlRoomModelServer } from './control-room.server';

function arrange({
  capabilities = ['edition.read', 'incident.read'],
  active = 0,
  critical = 0,
  incidentError = null as { message: string } | null,
  healthData = { status: 'ready', issues_count: 0, critical_count: 0 } as Record<string, unknown> | null,
  shows = [] as Array<{ id: string; status: string }>,
  broadcastData = null as Record<string, unknown> | null,
  broadcastError = null as { message?: string; code?: string } | null,
} = {}) {
  const incidentSelections: Array<{ select: string; head: boolean; count: string }> = [];
  const from = vi.fn((table: string) => {
    if (table === 'editions') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({
          data: { id: 'ssc22', name: 'SSC 22', status: 'active' }, error: null,
        }) }) }),
      };
    }
    if (table === 'edition_runtime_state') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    }
    if (table === 'edition_subsystem_states') {
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    }
    if (table === 'shows') {
      return {
        select: () => ({
          eq: (field: string, value: string) => {
            expect(field).toBe('edition_id');
            expect(value).toBe('ssc22');
            return {
              in: (column: string, statuses: string[]) => {
                expect(column).toBe('status');
                expect(statuses).toContain('live');
                return { limit: async (n: number) => {
                  expect(n).toBe(2);
                  return { data: shows.slice(0, n), error: null };
                } };
              },
            };
          },
        }),
      };
    }
    if (table === 'studio2_incidents') {
      const query = {
        eq: (_field: string, _value: string) => query,
        neq: (_field: string, _value: string) => query,
        or: (condition: string) => {
          expect(condition).toContain('severity.eq.sev1');
          return Promise.resolve({ count: critical, error: incidentError });
        },
        then: (resolve: (v: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ count: active, error: incidentError }).then(resolve, reject),
      };
      return { select: (selection: string, opts: { count: string; head: boolean }) => {
        incidentSelections.push({ select: selection, ...opts });
        return query;
      } };
    }
    throw new Error('Unexpected table: ' + table);
  });
  mocked.requireCapability.mockResolvedValue({
    userId: 'operator-1', capabilities, authoritative: true,
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'admin_edition_health_summary') return { data: healthData, error: null };
    if (name === 'studio2_broadcast_rundown') {
      expect(args).toEqual({ p_show_id: shows[0]?.id });
      return { data: broadcastData, error: broadcastError };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  mocked.createClient.mockReturnValue({ from, rpc });
  return { from, rpc, incidentSelections };
}

describe('Organizer Control Room server incident verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses permission-checked, metadata-only counts and reflects SEV-1 incidents', async () => {
    const db = arrange({ active: 3, critical: 1 });
    const model = await loadControlRoomModelServer('ssc22');
    expect(mocked.requireCapability).toHaveBeenCalledWith('edition.read', 'ssc22');
    expect(db.incidentSelections).toEqual([
      { select: 'id', count: 'exact', head: true },
      { select: 'id', count: 'exact', head: true },
    ]);
    expect(model.issues.incidents).toBe(3);
    expect(model.issues.criticalIncidents).toBe(1);
    expect(model.overallHealth).toBe('critical');
  });

  it('permits integrity readers without disclosing incident rows', async () => {
    const db = arrange({ capabilities: ['edition.read', 'integrity.read'], active: 1, critical: 0 });
    const model = await loadControlRoomModelServer('ssc22');
    expect(db.incidentSelections).toHaveLength(2);
    expect(model.overallHealth).toBe('attention');
  });

  it('treats absent count evidence as unknown even when the health RPC is ready', async () => {
    const db = arrange({ capabilities: ['edition.read'] });
    const model = await loadControlRoomModelServer('ssc22');
    expect(db.from.mock.calls.some(([table]) => table === 'studio2_incidents')).toBe(false);
    expect(model.overallHealth).toBe('unknown');
  });

  it('does not read protected incidents or invent zero when the viewer lacks incident access', async () => {
    const db = arrange({ capabilities: ['edition.read'] });
    const model = await loadControlRoomModelServer('ssc22');
    expect(db.from.mock.calls.some(([name]) => name === 'studio2_incidents')).toBe(false);
    expect(model.overallHealth).toBe('unknown');
  });

  it('marks unavailable incident schema as unverified rather than clean', async () => {
    arrange({ incidentError: { message: 'relation studio2_incidents does not exist' } });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.overallHealth).toBe('unknown');
  });

  it('propagates unexpected incident failures instead of reporting no incidents', async () => {
    arrange({ incidentError: { message: 'Database unavailable' } });
    await expect(loadControlRoomModelServer('ssc22')).rejects.toEqual({
      message: 'Database unavailable',
    });
  });

  it('rejects string-valued health counts instead of reporting verified healthy', async () => {
    arrange({ healthData: { status: 'ready', issues_count: '0', critical_count: 0 } });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.overallHealth).toBe('unknown');
  });

  it('requires a recognized authoritative health status', async () => {
    arrange({ healthData: { status: 'everything is fine', issues_count: 0, critical_count: 0 } });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.overallHealth).toBe('unknown');
  });

  it('rejects inconsistent health counts that claim more critical than total issues', async () => {
    arrange({ healthData: { status: 'ready', issues_count: 0, critical_count: 2 } });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.overallHealth).toBe('unknown');
  });

  it('preserves explicit blocked state even when health count evidence is malformed', async () => {
    arrange({ healthData: { status: 'blocked', issues_count: 'bad', critical_count: null } });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.overallHealth).toBe('critical');
  });

  it('preserves critical incident escalation despite inconsistent simultaneous count snapshots', async () => {
    arrange({ active: 1, critical: 2 });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.issues.incidents).toBeNull();
    expect(model.issues.criticalIncidents).toBe(2);
    expect(model.overallHealth).toBe('critical');
  });

  it('uses the authoritative live Show rundown for current and next cue labels', async () => {
    const db = arrange({
      capabilities: ['edition.read', 'edition.manage'],
      shows: [{ id: 'show-live', status: 'live' }],
      broadcastData: {
        version: 2, revision: 4, startAt: '2026-11-06T18:00:00Z',
        lockedAt: '2026-11-06T17:00:00Z', lockedBy: 'organizer', lockReason: 'Show ready',
        updatedAt: null, updatedBy: null,
        segments: [
          { id: 'opening', label: 'Opening', status: 'completed', plannedDurationSeconds: 60 },
          { id: 'performance', label: 'Performance 12 · Oland', status: 'live', plannedDurationSeconds: 180,
            actualStartedAt: '2026-11-06T18:01:00Z' },
          { id: 'next', label: 'Performance 13 · Vendia', status: 'ready', plannedDurationSeconds: 180 },
        ],
      },
    });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.currentSegment).toBe('Performance 12 · Oland');
    expect(model.nextSegment).toBe('Performance 13 · Vendia');
    expect(db.rpc).toHaveBeenCalledWith('studio2_broadcast_rundown', { p_show_id: 'show-live' });
  });

  it('never reads broadcast state for edition readers without manage permission', async () => {
    const db = arrange({ capabilities: ['edition.read', 'incident.read'] });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.currentSegment).toBeNull();
    expect(model.nextSegment).toBeNull();
    expect(db.from.mock.calls.some(([table]) => table === 'shows')).toBe(false);
    expect(db.rpc.mock.calls.some(([name]) => name === 'studio2_broadcast_rundown')).toBe(false);
  });

  it('does not invent current or next cue when live Show selection is ambiguous', async () => {
    const db = arrange({
      capabilities: ['edition.read', 'edition.manage'],
      shows: [{ id: 'show-a', status: 'live' }, { id: 'show-b', status: 'live' }],
    });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.currentSegment).toBeNull();
    expect(model.nextSegment).toBeNull();
    expect(db.rpc.mock.calls.some(([name]) => name === 'studio2_broadcast_rundown')).toBe(false);
  });

  it('omits the live cue projection for missing or invalid rundown evidence', async () => {
    const db = arrange({
      capabilities: ['edition.read', 'edition.manage'],
      shows: [{ id: 'show-live', status: 'live' }],
      broadcastData: { version: 2, revision: 1, startAt: 'bad time', segments: [] },
    });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.currentSegment).toBeNull();
    expect(model.nextSegment).toBeNull();
    expect(db.rpc).toHaveBeenCalledWith('studio2_broadcast_rundown', { p_show_id: 'show-live' });
  });

  it('does not leak broadcast data when the canonical broadcast RPC denies access', async () => {
    arrange({
      capabilities: ['edition.read', 'edition.manage'],
      shows: [{ id: 'show-live', status: 'live' }],
      broadcastError: { message: 'Organizer or edition.manage required', code: '42501' },
    });
    const model = await loadControlRoomModelServer('ssc22');
    expect(model.currentSegment).toBeNull();
    expect(model.nextSegment).toBeNull();
  });

  it('propagates unexpected rundown errors rather than substituting a fabricated cue', async () => {
    arrange({
      capabilities: ['edition.read', 'edition.manage'],
      shows: [{ id: 'show-live', status: 'live' }],
      broadcastError: { message: 'Network unavailable' },
    });
    await expect(loadControlRoomModelServer('ssc22')).rejects.toEqual({ message: 'Network unavailable' });
  });
});
