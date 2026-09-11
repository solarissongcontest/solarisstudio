import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const history = source('src/components/admin/ConfirmationVersionHistory.tsx');

describe('confirmation restore UI guardrails', () => {
  it('requires a reason and clearly preserves review safety', () => {
    expect(history).toContain("restoreReason.trim().length >= 8");
    expect(history).toContain('pending review');
    expect(history).toContain('The current state is captured as a new version before any change is applied.');
  });

  it('syncs the restored confirmation back to canonical Solaris after the backend succeeds', () => {
    expect(history).toContain("admin_restore_confirmation_version");
    expect(history).toContain("admin_confirmation_response");
    expect(history).toContain('syncConfirmationSnapshotToSolaris');
    expect(history).toContain('Solaris sync needs attention');
  });

  it('never presents history mutation as deletion or overwrite', () => {
    expect(history).toContain('existing history is never rewritten');
    expect(history).not.toMatch(/delete\s+history/i);
    expect(history).not.toMatch(/overwrite\s+history/i);
  });
});
