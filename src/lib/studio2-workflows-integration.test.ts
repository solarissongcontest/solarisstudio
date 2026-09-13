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

  it('derives workflow state from canonical edition, participant, show and runtime sources', () => {
    expect(route).toContain('useParticipants(resolvedEditionId');
    expect(route).toContain('useShows(resolvedEditionId');
    expect(route).toContain('studio2ControlRoom.loadSnapshot');
    expect(route).toContain('buildStudio2WorkflowModel');
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
