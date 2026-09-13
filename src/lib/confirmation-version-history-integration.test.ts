import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/submission-versions.tsx');
const history = source('src/components/admin/ConfirmationVersionHistory.tsx');
const readRpc = source('scripts/confirmations-submission-version-history-rpcs.sql');
const restoreRpc = source('scripts/confirmations-submission-version-restore.sql');
const restoreLocking = source('scripts/confirmations-submission-version-restore-locking.sql');

describe('confirmation version history integration', () => {
  it('keeps submission history discoverable in Organizer navigation', () => {
    expect(nav).toContain('"Submission history",');
    expect(nav).toContain('"/admin/submission-versions"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/submission-versions')");
  });

  it('uses organizer bridge RPCs instead of direct legacy table access', () => {
    expect(route).toContain("admin_confirmation_version_summary");
    expect(history).toContain("admin_confirmation_versions");
    expect(history).toContain("admin_restore_confirmation_version");
    expect(history).not.toContain(".from('submission_versions')");
  });

  it('keeps raw legacy snapshots behind server-side privacy projections', () => {
    expect(readRpc).not.toContain("#> '{submission,initial_ip}'");
    expect(readRpc).not.toContain("#> '{submission,latest_ip}'");
    expect(readRpc).not.toContain("#> '{submission,recovery_code}'");
    expect(readRpc).not.toContain("#> '{submission,browser_session_id}'");
    expect(readRpc).not.toContain("'snapshot', v.snapshot");
    expect(restoreRpc).not.toContain("#> '{submission,initial_ip}'");
    expect(restoreRpc).not.toContain("#> '{submission,recovery_code}'");
  });

  it('makes restoration append-only and provenance-aware', () => {
    expect(restoreRpc).toContain("'organizer_restore'");
    expect(restoreRpc).toContain('restored_from_version_id');
    expect(restoreRpc).toContain('change_reason');
    expect(restoreRpc).toContain('unique (submission_id, version)');
    expect(restoreRpc).toContain('current_snapshot');
    expect(restoreRpc).toContain("review_status = 'pending'");
    expect(restoreRpc).not.toMatch(/delete\s+from\s+public\.submission_versions/i);
    expect(history).toContain('Restore reason');
    expect(history).toContain('syncConfirmationSnapshotToSolaris');
  });

  it('serializes restore with the existing round-first confirmation edit lock order', () => {
    expect(restoreLocking).toContain('from public.submission_rounds r');
    expect(restoreLocking).toContain('for update');
    expect(restoreLocking).toContain('admin_restore_confirmation_version_apply');
    expect(restoreLocking).toContain('revoke all on function public.admin_restore_confirmation_version_apply');
  });
});
