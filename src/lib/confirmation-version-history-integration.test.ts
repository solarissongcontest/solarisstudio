import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/AdminNav.tsx');
const route = source('src/routes/_authenticated/admin/submission-versions.tsx');
const history = source('src/components/admin/ConfirmationVersionHistory.tsx');
const rpc = source('scripts/confirmations-submission-version-history-rpcs.sql');

describe('confirmation version history integration', () => {
  it('keeps submission history discoverable in Organizer navigation', () => {
    expect(nav).toContain('label: "Submission history"');
    expect(nav).toContain('to: "/admin/submission-versions"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/submission-versions')");
  });

  it('uses organizer bridge RPCs instead of direct legacy table access', () => {
    expect(route).toContain("admin_confirmation_version_summary");
    expect(history).toContain("admin_confirmation_versions");
    expect(history).not.toContain(".from('submission_versions')");
  });

  it('keeps the first version-history slice read-only', () => {
    expect(route).toContain('Version history is read-only here');
    expect(rpc).not.toMatch(/\binsert\s+into\b/i);
    expect(rpc).not.toMatch(/\bupdate\s+public\./i);
    expect(rpc).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('does not expose transport, recovery or browser-session fields from legacy snapshots', () => {
    expect(rpc).not.toContain("#> '{submission,initial_ip}'");
    expect(rpc).not.toContain("#> '{submission,latest_ip}'");
    expect(rpc).not.toContain("#> '{submission,recovery_code}'");
    expect(rpc).not.toContain("#> '{submission,browser_session_id}'");
    expect(rpc).not.toContain("'snapshot', v.snapshot");
  });
});
