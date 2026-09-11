import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from './feature-flags';
import {
  STUDIO2_PRODUCT_SURFACES,
  studio2EnabledDependents,
  studio2MissingDependencies,
  studio2RolloutDecision,
  studio2SurfaceRolloutEligible,
} from './studio2-product-surfaces';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function routeFile(route: string) {
  if (route.startsWith('/admin/')) {
    return resolve(process.cwd(), 'src/routes/_authenticated/admin', `${route.slice('/admin/'.length)}.tsx`);
  }
  if (route.startsWith('/country-hub/')) {
    return resolve(process.cwd(), 'src/routes/_authenticated/country-hub', `${route.slice('/country-hub/'.length)}.tsx`);
  }
  return null;
}

const adminNav = source('src/components/admin/AdminNav.tsx');
const hodLauncher = source('src/components/HodWorkspaceLauncher.tsx');
const adminRoute = source('src/routes/_authenticated/admin/route.tsx');

describe('Studio 2 stabilization contract', () => {
  it('classifies every feature flag exactly once', () => {
    expect(Object.keys(STUDIO2_PRODUCT_SURFACES).sort()).toEqual([...SOLARIS_FEATURE_FLAGS].sort());

    for (const key of SOLARIS_FEATURE_FLAGS) {
      expect(STUDIO2_PRODUCT_SURFACES[key].key).toBe(key);
    }
  });

  it('keeps all manifest dependencies valid and non-recursive at one hop', () => {
    for (const surface of Object.values(STUDIO2_PRODUCT_SURFACES)) {
      for (const dependency of surface.dependsOn ?? []) {
        expect(SOLARIS_FEATURE_FLAGS).toContain(dependency);
        expect(dependency).not.toBe(surface.key);
      }
    }
  });

  it('keeps dedicated and integrated product routes backed by real route files', () => {
    const routed = Object.values(STUDIO2_PRODUCT_SURFACES).filter((surface) => surface.route);
    expect(routed.length).toBeGreaterThan(0);

    for (const surface of routed) {
      const file = routeFile(surface.route!);
      expect(file, `${surface.key} uses an unsupported manifest route shape`).not.toBeNull();
      expect(existsSync(file!), `${surface.key} route ${surface.route} has no route file`).toBe(true);
    }
  });

  it('keeps organizer Studio 2 surfaces discoverable from Organizer navigation', () => {
    const organizerSurfaces = Object.values(STUDIO2_PRODUCT_SURFACES)
      .filter((surface) => surface.audience === 'organizer' && surface.route && (surface.state === 'product_surface' || surface.state === 'integrated'));

    for (const surface of organizerSurfaces) {
      expect(adminNav, `${surface.label} disappeared from Organizer navigation`).toContain(surface.route!);
    }
  });

  it('keeps delegation Studio 2 surfaces discoverable from My Solaris delegation operations', () => {
    const delegationSurfaces = Object.values(STUDIO2_PRODUCT_SURFACES)
      .filter((surface) => surface.audience === 'delegation' && surface.route && (surface.state === 'product_surface' || surface.state === 'integrated'));

    for (const surface of delegationSurfaces) {
      expect(hodLauncher, `${surface.label} disappeared from the delegation launcher`).toContain(surface.route!);
    }
  });

  it('rollout-locks planned and externally owned work while allowing finished foundations and surfaces', () => {
    for (const surface of Object.values(STUDIO2_PRODUCT_SURFACES)) {
      const shouldBeEligible = surface.state !== 'planned' && surface.state !== 'external_workstream';
      expect(studio2SurfaceRolloutEligible(surface), surface.key).toBe(shouldBeEligible);
    }
  });

  it('requires declared dependencies before a dependent feature can be enabled', () => {
    const noDependencies = new Set<SolarisFeatureFlag>();
    expect(studio2MissingDependencies('live_control_room', noDependencies).sort()).toEqual([
      'contest_event_engine',
      'edition_state_engine',
    ]);

    const controlRoomReady = new Set<SolarisFeatureFlag>(['edition_state_engine', 'contest_event_engine']);
    expect(studio2MissingDependencies('live_control_room', controlRoomReady)).toEqual([]);

    const simulatorIncomplete = new Set<SolarisFeatureFlag>(['edition_state_engine']);
    expect(studio2MissingDependencies('edition_simulator', simulatorIncomplete)).toEqual(['live_control_room']);
  });

  it('protects enabled dependencies from being disabled underneath active features', () => {
    const enabled = new Set<SolarisFeatureFlag>([
      'edition_state_engine',
      'contest_event_engine',
      'live_control_room',
      'incident_command',
      'edition_simulator',
    ]);

    expect(studio2EnabledDependents('edition_state_engine', enabled)).toEqual(expect.arrayContaining(['live_control_room', 'edition_simulator']));
    expect(studio2EnabledDependents('live_control_room', enabled)).toEqual(expect.arrayContaining(['incident_command', 'edition_simulator']));
    expect(studio2EnabledDependents('contest_event_engine', enabled)).toEqual(['live_control_room']);
    expect(studio2EnabledDependents('incident_command', enabled)).toEqual([]);
  });

  it('makes rollout decisions from product state and dependency state rather than route-source strings', () => {
    expect(studio2RolloutDecision('rules_engine', false, new Set())).toEqual({
      allowed: false,
      blockingKeys: [],
      reason: 'rollout_locked',
    });

    expect(studio2RolloutDecision('live_control_room', false, new Set())).toEqual({
      allowed: false,
      blockingKeys: ['edition_state_engine', 'contest_event_engine'],
      reason: 'missing_dependencies',
    });

    const foundations = new Set<SolarisFeatureFlag>(['edition_state_engine', 'contest_event_engine']);
    expect(studio2RolloutDecision('live_control_room', false, foundations)).toEqual({
      allowed: true,
      blockingKeys: [],
      reason: 'allowed',
    });

    const activeControlRoom = new Set<SolarisFeatureFlag>([
      'edition_state_engine',
      'contest_event_engine',
      'live_control_room',
    ]);
    expect(studio2RolloutDecision('edition_state_engine', true, activeControlRoom)).toEqual({
      allowed: false,
      blockingKeys: ['live_control_room'],
      reason: 'active_dependents',
    });
  });

  it('keeps the separate Rules workstream explicitly isolated', () => {
    const rules = STUDIO2_PRODUCT_SURFACES.rules_engine;
    expect(rules.state).toBe('external_workstream');
    expect(rules.route).toBeUndefined();
    expect(studio2SurfaceRolloutEligible(rules)).toBe(false);
  });

  it('keeps every authenticated Organizer route behind the organizer role boundary', () => {
    expect(adminRoute).toContain('.eq("role", "organizer")');
    expect(adminRoute).toContain('throw redirect({ to: "/country-hub" })');
  });
});
