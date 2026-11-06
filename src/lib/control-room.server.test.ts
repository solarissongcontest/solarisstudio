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
  const rpc = vi.fn(async () => ({ data: healthData, error: null }));
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
});
