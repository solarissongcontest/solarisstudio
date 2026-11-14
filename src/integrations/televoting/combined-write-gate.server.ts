/**
 * COM-00: Separate Combined Televote is deferred for the owner-only V3 beta.
 * Deny server-function endpoints and direct internal sync invocations before
 * any Combined calculation, publication, or mutation is executed.
 *
 * Deliberately no environment toggle: future enablement requires canonical
 * transactional commands, effective DB authority tests, and owner approval.
 * Ordinary Jury and round-based Televote remain outside this guard.
 */
export function requireCombinedTelevoteWriteApproval(): void {
  throw new Error("Combined Televote mutations are disabled pending canonical authority certification.");
}
