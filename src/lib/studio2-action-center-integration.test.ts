import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/action-center.tsx');
const model = source('src/lib/studio2-action-center.ts');

describe('Studio 2 Action Center integration', () => {
  it('is discoverable from Organizer navigation', () => {
    expect(nav).toContain('"Action Center",');
    expect(nav).toContain('"/admin/action-center"');
    expect(nav).toContain('label: "Operations"');
  });

  it('aggregates the existing Control Room rather than duplicating operational persistence', () => {
    expect(route).toContain('studio2ControlRoom.loadSnapshot');
    expect(route).toContain('studio2ControlRoom.listTransitionApprovals');
    expect(route).toContain('buildStudio2ActionCenter');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.delete(');
    expect(route).not.toContain('.rpc(');
  });

  it('keeps Action Center read-only and routes work to authoritative surfaces', () => {
    expect(model).toContain("href: '/admin/control-room'");
    expect(model).toContain("href: '/admin/broadcast-rundown'");
    expect(model).toContain('/admin/participant-status/');
  });

  it('does not absorb Rules or Friend Voting into the operational queue', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
    expect(model).not.toContain('rules_engine');
    expect(model).not.toContain('friend-voting');
  });
});
