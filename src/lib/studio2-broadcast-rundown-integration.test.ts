import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/AdminNav.tsx');
const route = source('src/routes/_authenticated/admin/broadcast-rundown.tsx');
const adapter = source('src/lib/studio2-broadcast-rundown.ts');

describe('Studio 2 Broadcast Rundown integration', () => {
  it('is discoverable from Organizer navigation', () => {
    expect(nav).toContain('label: "Rundown"');
    expect(nav).toContain('to: "/admin/broadcast-rundown"');
  });

  it('uses the existing show broadcast configuration instead of a parallel table', () => {
    expect(adapter).toContain("from('shows')");
    expect(adapter).toContain('broadcast_config');
    expect(adapter).toContain('STUDIO2_RUNDOWN_CONFIG_KEY');
    expect(adapter).not.toContain('studio2_broadcast_rundown_segments');
  });

  it('is rollout-gated and powered by the existing timing engine', () => {
    expect(adapter).toContain("isStudio2FeatureEnabled('broadcast_rundown')");
    expect(route).toContain('buildBroadcastRundown');
    expect(route).toContain('Estimated broadcast clock');
    expect(route).toContain('Save rundown');
  });

  it('does not pretend planner edits are audited live segment events', () => {
    expect(route).not.toContain('broadcast.segment_started');
    expect(route).not.toContain('broadcast.segment_completed');
  });

  it('does not touch Rules or Friend Voting', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('friend-voting');
    expect(adapter).not.toContain('rules_engine');
  });
});
