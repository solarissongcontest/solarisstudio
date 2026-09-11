import { describe, expect, it } from 'vitest';
import { createEditionSimulation, runEditionSimulation } from './edition-simulator';
import { defaultSubsystemStatesForEdition } from './edition-state';

describe('edition simulator', () => {
  it('runs a live-show voting outage scenario without touching production state', () => {
    const initial = createEditionSimulation({
      startsAt: '2026-09-10T18:00:00.000Z',
      runtime: {
        edition: 'live_show',
        subsystems: defaultSubsystemStatesForEdition('live_show'),
      },
    });

    const result = runEditionSimulation(initial, [
      { type: 'transition_edition', to: 'televoting' },
      { type: 'set_subsystem', subsystem: 'televoting', state: 'open' },
      { type: 'advance_time', seconds: 120 },
      { type: 'create_incident', id: 'outage', title: 'Televote API unavailable', severity: 'sev1' },
      { type: 'set_subsystem', subsystem: 'televoting', state: 'paused' },
      { type: 'advance_time', seconds: 300 },
      { type: 'resolve_incident', id: 'outage' },
      { type: 'set_subsystem', subsystem: 'televoting', state: 'open' },
    ]);

    expect(result.clock).toBe('2026-09-10T18:07:00.000Z');
    expect(result.runtime.edition).toBe('televoting');
    expect(result.runtime.subsystems.televoting).toBe('open');
    expect(result.incidents[0].active).toBe(false);
    expect(result.log).toHaveLength(8);
  });

  it('rejects impossible lifecycle jumps', () => {
    const initial = createEditionSimulation({
      startsAt: '2026-09-10T18:00:00.000Z',
      runtime: {
        edition: 'planning',
        subsystems: defaultSubsystemStatesForEdition('planning'),
      },
    });

    expect(() => runEditionSimulation(initial, [{ type: 'transition_edition', to: 'results' }])).toThrow(
      /Illegal edition state transition/,
    );
  });
});
