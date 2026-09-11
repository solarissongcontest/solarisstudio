import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const adminNav = source('src/components/admin/AdminNav.tsx');
const controlRoomAlias = source('src/routes/_authenticated/admin/control-room.tsx');
const rollout = source('src/routes/_authenticated/admin/feature-rollout.tsx');
const hodLauncher = source('src/components/HodWorkspaceLauncher.tsx');

describe('Studio 2 product integration', () => {
  it('keeps the Live Control Room discoverable from Organizer navigation', () => {
    expect(adminNav).toContain('label: "Control Room"');
    expect(adminNav).toContain('to: "/admin/control-room"');
    expect(controlRoomAlias).toContain('to: "/admin/control-room-v2"');
    expect(controlRoomAlias).not.toContain('to: "/admin/operations"');
  });

  it('keeps rollout controls discoverable for organizers', () => {
    expect(adminNav).toContain('label: "Feature rollout"');
    expect(adminNav).toContain('to: "/admin/feature-rollout"');
    expect(rollout).toContain("studio2_set_feature_flag");
    expect(rollout).toContain('Rules Hub and Trust & Integrity implementation are managed independently');
  });

  it('preserves the existing HOD workspace launcher instead of duplicating its route', () => {
    expect(hodLauncher).toContain("'/country-hub/hod'");
    expect(hodLauncher).toContain("'hod_workspace_v2'");
  });
});
