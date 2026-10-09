import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const domains = source('src/components/admin/admin-domains.ts');
const route = source('src/routes/_authenticated/admin/action-center.tsx');

describe('Studio 2 Action Center compatibility', () => {
  it('keeps canonical Tasks discoverable while preserving the legacy Action Center URL', () => {
    expect(domains).toContain('label: "Tasks"');
    expect(domains).toContain('to: "/admin/tasks"');
    expect(route).toContain('createFileRoute("/_authenticated/admin/action-center")');
    expect(route).toContain('to: "/admin/tasks"');
    expect(route).toContain('filter: "all"');
    expect(route).toContain('replace: true');
  });

  it('keeps the retired Action Center route as a redirect instead of a second operational owner', () => {
    expect(route).toContain('throw redirect');
    expect(route).toContain('component: () => null');
    expect(route).not.toContain('studio2ControlRoom');
    expect(route).not.toContain('buildStudio2ActionCenter');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.delete(');
    expect(route).not.toContain('.rpc(');
  });
});
