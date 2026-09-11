import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/edition-simulator.tsx');
const engine = source('src/lib/edition-simulator.ts');

describe('Studio 2 Edition Simulator integration', () => {
  it('starts from the existing Control Room read model', () => {
    expect(route).toContain('getControlRoomModel');
    expect(route).toContain('controlRoomQuery.data.editionState');
    expect(route).toContain('controlRoomQuery.data.subsystems');
  });

  it('uses the pure simulation engine and lifecycle legality checks', () => {
    expect(route).toContain('createEditionSimulation');
    expect(route).toContain('applySimulationAction');
    expect(route).toContain('canTransitionEdition');
    expect(engine).toContain('assertEditionTransition');
  });

  it('is rollout-gated and production-write free', () => {
    expect(route).toContain("isStudio2FeatureEnabled('edition_simulator')");
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.delete(');
    expect(route).not.toContain('.rpc(');
  });

  it('supports incident drills, time advancement and subsystem rehearsal', () => {
    expect(route).toContain("type: 'create_incident'");
    expect(route).toContain("type: 'resolve_incident'");
    expect(route).toContain("type: 'advance_time'");
    expect(route).toContain("type: 'set_subsystem'");
  });

  it('does not touch Rules or Friend Voting', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
  });
});
