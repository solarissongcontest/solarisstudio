/**
 * Legacy Confirmation settings still use a non-CAS mutation RPC. Before
 * sending it, fail closed if the exact loaded submission, edition, round or
 * response revision changed while the Organizer reviewed access changes.
 * This is a UI safety guard, NOT a replacement for server-side CAS.
 */
export type OrganizerConfirmationAccessScope = {
  submissionId: string;
  editionId: string;
  roundId: string;
  updatedAt: string;
};

export function assertOrganizerConfirmationAccessScope(
  expected: OrganizerConfirmationAccessScope,
  live: OrganizerConfirmationAccessScope,
): void {
  if (!expected.submissionId || !expected.editionId || !expected.roundId || !expected.updatedAt) {
    throw new Error("Confirmation settings review lacks an exact response scope. Nothing was changed.");
  }
  if (expected.submissionId !== live.submissionId ||
      expected.editionId !== live.editionId ||
      expected.roundId !== live.roundId) {
    throw new Error("Confirmation settings response moved outside the reviewed Organizer edition or round. Nothing was changed.");
  }
  if (expected.updatedAt !== live.updatedAt) {
    throw new Error("This Confirmation response changed after the settings review began. Reload before changing access.");
  }
}
