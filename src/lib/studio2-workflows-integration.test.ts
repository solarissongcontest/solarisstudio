import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/workflows.tsx');
const model = source('src/lib/studio2-workflows.ts');

describe('Studio 2 Workflows integration', () => {
  it('is discoverable from Organizer operations navigation', () => {
    expect(nav).toContain('"Workflows",');
    expect(nav).toContain('"/admin/workflows"');
    expect(nav).toContain('label: "Operations"');
  });

  it('uses the shared workflow engine instead of inventing a second state machine', () => {
    expect(model).toContain("from './workflow-engine'");
    expect(model).toContain('evaluateWorkflow(tasks, now)');
    expect(model).not.toContain("from('workflows')");
    expect(model).not.toContain('.insert(');
    expect(model).not.toContain('.update(');
  });

  it('derives workflow state from exact-edition canonical data and Studio 2 runtime', () => {
    expect(route).toContain('useParticipants(resolvedEditionId');
    expect(route).toContain('useShows(resolvedEditionId');
    expect(route).toContain('loadStudio2ControlRoomSnapshot(resolvedEditionId, undefined, 100)');
    expect(route).toContain('const runtime = snapshotQuery.data?.runtime.runtime ?? null');
    expect(route).toContain('buildStudio2WorkflowModel');
    expect(route).not.toContain('normalizeLegacyEditionStatus');
    expect(route).not.toContain('defaultSubsystemStatesForEdition');
  });

  it('does not couple workflow runtime truth to the Control Room presentation rollout', () => {
    expect(route).toContain("isStudio2FeatureEnabled('workflow_engine', resolvedEditionId)");
    expect(route).not.toContain("isStudio2FeatureEnabled('live_control_room'");
    expect(route).not.toContain('Compatibility runtime in use');
  });

  it('keeps queue filters and workflow inspection URL-addressable', () => {
    expect(route).toContain('validateSearch:');
    expect(route).toContain('status?: Studio2WorkflowStatus');
    expect(route).toContain('kind?: Studio2WorkflowKind');
    expect(route).toContain('owner?: Studio2WorkflowOwner');
    expect(route).toContain('country?: string');
    expect(route).toContain('workflow?: string');
    expect(route).toContain('<WorkflowDetailSheet');
  });

  it('routes operators back to authoritative specialist surfaces instead of mutating domain state', () => {
    expect(model).toContain("href: '/admin/control-room'");
    expect(model).toContain("href: '/admin/broadcast-rundown'");
    expect(model).toContain('/admin/participant-status/');
    expect(route).toContain('Continue in authoritative tools');
    expect(route).not.toContain('.rpc(');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
  });
});