import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultSubsystemStatesForEdition } from './edition-state';
import {
  applySimulationAction,
  createEditionSimulation,
  runEditionSimulation,
} from './edition-simulator';

function simulation() {
  return createEditionSimulation({
    startsAt: '2026-10-20T06:00:00.000Z',
    runtime: {
      edition: 'planning',
      subsystems: defaultSubsystemStatesForEdition('planning'),
    },
  });
}

describe('V3 Edition Simulation runtime', () => {
  it('starts with explicit isolated rehearsal domains', () => {
    const state = simulation();
    expect(state.domains.entries.state).toBe('not_started');
    expect(state.domains.publication.state).toBe('not_started');
    expect(state.domains.progression.state).toBe('not_started');
    expect(state.domains.live.state).toBe('planning');
  });

  it('rehearses entry review independently from production submission state', () => {
    const state = runEditionSimulation(simulation(), [
      { type: 'transition_entries', to: 'collecting' },
      { type: 'transition_entries', to: 'reviewing' },
      { type: 'transition_entries', to: 'changes_requested' },
      { type: 'transition_entries', to: 'collecting' },
      { type: 'transition_entries', to: 'reviewing' },
      { type: 'transition_entries', to: 'accepted' },
      { type: 'transition_entries', to: 'locked' },
    ]);

    expect(state.domains.entries.state).toBe('locked');
    expect(state.runtime.subsystems.submissions).toBe('not_started');
  });

  it('fails closed when publication has an active blocker', () => {
    let state = applySimulationAction(simulation(), {
      type: 'set_domain_blocker',
      domain: 'publication',
      id: 'results-unverified',
      label: 'Results are not verified',
      active: true,
    });
    state = applySimulationAction(state, { type: 'transition_publication', to: 'blocked' });

    expect(() =>
      applySimulationAction(state, { type: 'transition_publication', to: 'ready' }),
    ).toThrow('publication simulation has active blockers');

    state = applySimulationAction(state, {
      type: 'set_domain_blocker',
      domain: 'publication',
      id: 'results-unverified',
      label: 'Results are not verified',
      active: false,
    });
    state = applySimulationAction(state, { type: 'transition_publication', to: 'ready' });
    expect(state.domains.publication.state).toBe('ready');
  });

  it('requires the expected qualifier set before progression can lock', () => {
    let state = applySimulationAction(simulation(), {
      type: 'set_progression_counts',
      qualifiersExpected: 10,
      qualifiersApplied: 8,
    });
    state = applySimulationAction(state, { type: 'transition_progression', to: 'ready' });
    state = applySimulationAction(state, { type: 'transition_progression', to: 'applied' });

    expect(() =>
      applySimulationAction(state, { type: 'transition_progression', to: 'locked' }),
    ).toThrow('Progression cannot lock until the expected qualifier set is applied');

    state = applySimulationAction(state, {
      type: 'set_progression_counts',
      qualifiersExpected: 10,
      qualifiersApplied: 10,
    });
    state = applySimulationAction(state, { type: 'transition_progression', to: 'locked' });
    expect(state.domains.progression.state).toBe('locked');
  });

  it('models live rehearsal, arming, live hold and completion explicitly', () => {
    const state = runEditionSimulation(simulation(), [
      { type: 'transition_live', to: 'rehearsal' },
      { type: 'transition_live', to: 'armed' },
      { type: 'transition_live', to: 'live' },
      { type: 'transition_live', to: 'held' },
      { type: 'transition_live', to: 'live' },
      { type: 'transition_live', to: 'complete' },
    ]);
    expect(state.domains.live.state).toBe('complete');
    expect(state.log.at(-1)?.summary).toBe('live live -> complete');
  });

  it('rejects illegal domain jumps instead of inventing client state', () => {
    expect(() =>
      applySimulationAction(simulation(), { type: 'transition_publication', to: 'published' }),
    ).toThrow('Illegal publication simulation transition');
    expect(() =>
      applySimulationAction(simulation(), { type: 'transition_live', to: 'live' }),
    ).toThrow('Illegal live simulation transition');
  });

  it('contains no persistence or production mutation dependency', () => {
    const simulatorSource = readFileSync(resolve(process.cwd(), 'src/lib/edition-simulator.ts'), 'utf8');
    const domainSource = readFileSync(resolve(process.cwd(), 'src/lib/edition-simulation-domains.ts'), 'utf8');
    const source = `${simulatorSource}\n${domainSource}`;

    expect(source).not.toContain('supabase');
    expect(source).not.toContain('.from(');
    expect(source).not.toContain('.rpc(');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('useServerFn');
  });
});
