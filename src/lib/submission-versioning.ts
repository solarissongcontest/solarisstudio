export type SubmissionSnapshot = Record<string, unknown>;

export type SubmissionVersion = {
  id: string;
  submissionId: string;
  version: number;
  snapshot: SubmissionSnapshot;
  changedBy: string;
  changedAt: string;
  reason: string | null;
};

export type SubmissionLock = {
  locked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  exceptionUntil: string | null;
  exceptionReason: string | null;
  exceptionGrantedBy: string | null;
};

export type SubmissionChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export function diffSubmissionSnapshots(
  before: SubmissionSnapshot,
  after: SubmissionSnapshot,
): SubmissionChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .sort()
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function nextSubmissionVersion(input: {
  submissionId: string;
  previous: SubmissionVersion | null;
  snapshot: SubmissionSnapshot;
  changedBy: string;
  changedAt?: string;
  reason?: string | null;
  id?: string;
}): SubmissionVersion {
  if (!input.submissionId.trim()) throw new Error('Submission id is required');
  if (!input.changedBy.trim()) throw new Error('Submission version actor is required');

  return {
    id: input.id ?? `${input.submissionId}:v${(input.previous?.version ?? 0) + 1}`,
    submissionId: input.submissionId,
    version: (input.previous?.version ?? 0) + 1,
    snapshot: structuredClone(input.snapshot),
    changedBy: input.changedBy,
    changedAt: input.changedAt ?? new Date().toISOString(),
    reason: input.reason?.trim() || null,
  };
}

export function canEditSubmission(lock: SubmissionLock, now = new Date()): boolean {
  if (!lock.locked) return true;
  if (!lock.exceptionUntil) return false;
  const exceptionEnd = new Date(lock.exceptionUntil).getTime();
  return Number.isFinite(exceptionEnd) && exceptionEnd > now.getTime();
}

export function grantSubmissionEditException(input: {
  lock: SubmissionLock;
  until: string;
  reason: string;
  grantedBy: string;
  now?: Date;
}): SubmissionLock {
  if (!input.lock.locked) throw new Error('An edit exception is only required for a locked submission');
  if (!input.reason.trim()) throw new Error('An edit exception requires a reason');
  if (!input.grantedBy.trim()) throw new Error('An edit exception requires an approver');

  const now = input.now ?? new Date();
  const until = new Date(input.until);
  if (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime()) {
    throw new Error('Edit exception expiry must be in the future');
  }

  return {
    ...input.lock,
    exceptionUntil: until.toISOString(),
    exceptionReason: input.reason.trim(),
    exceptionGrantedBy: input.grantedBy,
  };
}
