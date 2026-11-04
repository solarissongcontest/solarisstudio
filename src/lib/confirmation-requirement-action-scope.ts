/**
 * An Organizer requirement completion may affect the review sheet only
 * while the user is still operating in the edition that submitted it.
 *
 * The canonical server RPC owns the mutation; this only protects client
 * review state, toasts and the edition-specific screen projection.
 */
export function isCurrentConfirmationRequirementAction(
  requestedEditionId: string | null | undefined,
  currentEditionId: string | null | undefined,
): boolean {
  return typeof requestedEditionId === "string" &&
    requestedEditionId.length > 0 &&
    requestedEditionId === currentEditionId;
}
