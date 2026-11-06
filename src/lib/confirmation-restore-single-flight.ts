/**
 * Per-tab, per-submission guard for the legacy Confirmation history restore.
 *
 * A mutation can outlive its React component when an Organizer changes the
 * selected submission. A component-local ref alone cannot prevent another
 * mounted copy from submitting an identical restore while the first is pending.
 *
 * This is only a client-side concurrency guard: the authoritative backend still
 * needs expected-version/idempotency enforcement for multi-tab/device safety.
 */
const pendingRestores = new Set<string>();

export class ConfirmationRestoreAlreadyPendingError extends Error {
  constructor() {
    super('A historical restore is already in progress for this submission. Reconcile its outcome before retrying.');
    this.name = 'ConfirmationRestoreAlreadyPendingError';
  }
}

export async function runConfirmationRestoreSingleFlight<T>(
  submissionId: string,
  execute: () => Promise<T>,
): Promise<T> {
  if (pendingRestores.has(submissionId)) {
    throw new ConfirmationRestoreAlreadyPendingError();
  }
  pendingRestores.add(submissionId);
  try {
    return await execute();
  } finally {
    pendingRestores.delete(submissionId);
  }
}
