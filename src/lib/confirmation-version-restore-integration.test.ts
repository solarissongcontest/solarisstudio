import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const restore = source('scripts/confirmations-submission-version-restore.sql');
const locking = source('scripts/confirmations-submission-version-restore-locking.sql');

describe('confirmation submission restore backend', () => {
  it('preserves the current state as a new immutable audit version before restoring', () => {
    expect(restore).toContain("'organizer_restore'");
    expect(restore).toContain('current_snapshot');
    expect(restore).toContain('restored_from_version_id');
    expect(restore).toContain('change_reason');
    expect(restore).toContain('unique (submission_id, version)');
    expect(restore).not.toMatch(/delete\s+from\s+public\.submission_versions/i);
  });

  it('never restores historical organizer review decisions', () => {
    expect(restore).toContain("review_status = 'pending'");
    expect(restore).toContain('review_reason = null');
    expect(restore).toContain('reviewed_at = null');
    expect(restore).toContain('reviewed_by = null');
  });

  it('matches ordinary edit lock ordering and blocks moderation bypass', () => {
    expect(locking).toContain('from public.submission_rounds r');
    expect(locking).toContain('for update');
    expect(locking).toContain('admin_restore_confirmation_version_apply');
    expect(locking).toContain('removed by organizer moderation');
    expect(locking).toContain('coalesce(removed_entry.removed, false) = true');
  });

  it('does not expose the inner mutation helper as a public RPC', () => {
    expect(locking).toContain('revoke all on function public.admin_restore_confirmation_version_apply');
    expect(locking).toContain('from public, anon, authenticated, service_role');
    expect(locking).toContain('grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)');
  });
});
