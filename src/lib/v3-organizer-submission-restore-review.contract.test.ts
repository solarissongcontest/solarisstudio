import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const history = source('src/components/admin/ConfirmationVersionHistory.tsx');
const route = source('src/routes/_authenticated/admin/submission-versions.tsx');

describe('V3 Organizer submission-history restore review', () => {
  it('captures the exact target and current history baseline before restore', () => {
    expect(history).toContain('RestoreBaseline');
    expect(history).toContain('targetId: target.id');
    expect(history).toContain('targetVersion: target.version');
    expect(history).toContain('latestVersion: latestVersionNumber(versions)');
    expect(history).toContain('versionCount: versions.length');
  });

  it('revalidates live history and fails closed if a newer edit appeared', () => {
    expect(history).toContain('versionsQuery.refetch()');
    expect(history).toContain('liveVersions.length !== restoreBaseline.versionCount');
    expect(history).toContain('latestVersion !== restoreBaseline.latestVersion');
    expect(history).toContain('This submission gained a newer history version while the restore review was open');
    expect(history).toContain('Nothing was restored. Reopen the review from the latest state.');
  });

  it('rechecks that the exact historical target still exists before invoking restore authority', () => {
    expect(history).toContain('liveVersions.find((version) => version.id === restoreBaseline.targetId)');
    expect(history).toContain('liveTarget.version !== restoreBaseline.targetVersion');
    expect(history).toContain("restoreMutation.mutate({ target: liveTarget, reason: restoreReason })");
    expect(history.match(/admin_restore_confirmation_version/g)?.length).toBe(1);
  });

  it('repeats exact delegation scope and consequential restore evidence', () => {
    expect(history).toContain('scopeLabel');
    expect(history).toContain('Submission ID: {submissionId}');
    expect(history).toContain('Target snapshot ID: {restoreTarget.id}');
    expect(history).toContain('Tracked field changes if restored now: {restoreImpact.length}');
    expect(route).toContain('selected.country');
    expect(route).toContain('selected.editions.edition_number');
    expect(route).toContain("selected.submission_rounds?.name ?? 'Confirmation'");
    expect(route).toContain('scopeLabel={restoreScopeLabel}');
  });

  it('keeps the legacy authority boundary explicit instead of inventing receipt parity', () => {
    expect(history).toContain('legacy restore authority still does not provide a canonical idempotency key or operation receipt');
    expect(history).toContain('ambiguous failure must be reconciled from refreshed history before retrying');
    expect(history).toContain('Restore reason');
  });
});