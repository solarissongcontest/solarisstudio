import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfirmationRestoreAlreadyPendingError, runConfirmationRestoreSingleFlight } from './confirmation-restore-single-flight';

const history = readFileSync(
  resolve(process.cwd(), 'src/components/admin/ConfirmationVersionHistory.tsx'),
  'utf8',
);
const route = readFileSync(
  resolve(process.cwd(), 'src/routes/_authenticated/admin/submission-versions.tsx'),
  'utf8',
);

describe('Organizer Confirmation historical restore safety', () => {
  it('is not allowed to carry an open restore review into another selected submission', () => {
    expect(route).toMatch(
      /<ConfirmationVersionHistory\s+key=\{detailQuery\.data\.id\}\s+submissionId=\{detailQuery\.data\.id\}/,
    );
  });

  it('reserves a synchronous single-flight guard before the remote history recheck and releases it only after settlement', () => {
    const confirmRestore = history.slice(
      history.indexOf('const confirmRestore = async () => {'),
      history.indexOf('\n  return (\n    <>', history.indexOf('const confirmRestore = async () => {')),
    );
    expect(history).toContain('const restoreInFlightRef = useRef(false)');
    expect(history).toContain('runConfirmationRestoreSingleFlight(submissionId, async () => {');
    expect(confirmRestore).toContain('restoreInFlightRef.current ||');
    expect(confirmRestore).toMatch(
      /restoreInFlightRef\.current = true;[\s\S]*await versionsQuery\.refetch\(\);[\s\S]*restoreMutation\.mutate\(/,
    );
    expect(confirmRestore).toMatch(
      /catch \(error\) \{\s*restoreInFlightRef\.current = false;/,
    );
    expect(history).toMatch(
      /onSettled: \(\) => \{\s*restoreInFlightRef\.current = false;/,
    );
    expect(history).toContain('if (restoreInFlightRef.current || restoreMutation.isPending || reviewChecking) return;');
  });

  it('does not offer blind retry when a consequential restore result is uncertain', () => {
    const failureHandler = history.slice(
      history.indexOf('    onError: (error) => {'),
      history.indexOf('    onSettled: () => {'),
    );
    expect(failureHandler).toContain('setRestoreTarget(null)');
    expect(failureHandler).toContain("setRestoreReason('')");
    expect(failureHandler).toContain('setRestoreBaseline(null)');
    expect(failureHandler).toContain("['confirmation-submission-versions', submissionId]");
    expect(failureHandler).toContain("['confirmation-response-version-current']");
    expect(failureHandler).toContain("['confirmation-responses-for-version-history']");
    expect(failureHandler).toContain('Restore outcome is unconfirmed');
    expect(failureHandler).toContain('Review refreshed history and the current response before trying again');
  });

  it('blocks opening a review from stale history while a refresh or restore is in progress', () => {
    expect(history).toContain(
      'if (restoreInFlightRef.current || versionsQuery.isFetching || versionsQuery.error) return;',
    );
    expect(history).toContain(
      'disabled={versionsQuery.isFetching || restoreMutation.isPending || reviewChecking}',
    );
  });
});

describe('Confirmation restore single-flight behavior', () => {
  it('refuses a second same-submission operation even when called by a different component', async () => {
    let release!: () => void;
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runConfirmationRestoreSingleFlight('submission-1', async () => {
      calls++;
      await gate;
      return 'restored';
    });

    await expect(
      runConfirmationRestoreSingleFlight('submission-1', async () => {
        calls++;
        return 'duplicate';
      }),
    ).rejects.toBeInstanceOf(ConfirmationRestoreAlreadyPendingError);
    expect(calls).toBe(1);

    // An unrelated edition/submission must not be held hostage by the lock.
    await expect(runConfirmationRestoreSingleFlight('submission-2', async () => 'independent'))
      .resolves.toBe('independent');

    release();
    await expect(first).resolves.toBe('restored');
    await expect(runConfirmationRestoreSingleFlight('submission-1', async () => 'retry'))
      .resolves.toBe('retry');
  });

  it('always releases the lock when the operation rejects', async () => {
    await expect(runConfirmationRestoreSingleFlight('failure', async () => {
      throw new Error('unknown network outcome');
    })).rejects.toThrow('unknown network outcome');
    await expect(runConfirmationRestoreSingleFlight('failure', async () => 'reconciled'))
      .resolves.toBe('reconciled');
  });
});
