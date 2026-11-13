/**
 * Bind a confirmation edit-token handoff to the exact authenticated context
 * in which it was requested. This is a client navigation safety fence, not
 * a substitute for server-side authorization or token validation.
 */
export type ConfirmationEditScopeInput = {
  actorId: string | null;
  countryId: string | null;
  editionId: string | null;
  roundId: string | null;
  authorized: boolean;
};

export type ConfirmationEditScope = ConfirmationEditScopeInput & {
  generation: number;
};

export function advanceConfirmationEditScope(
  previous: ConfirmationEditScope,
  next: ConfirmationEditScopeInput,
): ConfirmationEditScope {
  const changed =
    previous.actorId !== next.actorId ||
    previous.countryId !== next.countryId ||
    previous.editionId !== next.editionId ||
    previous.roundId !== next.roundId ||
    previous.authorized !== next.authorized;
  return { ...next, generation: previous.generation + (changed ? 1 : 0) };
}

export function canUseConfirmationEditToken(
  issuedFor: ConfirmationEditScope,
  current: ConfirmationEditScope,
): boolean {
  return Boolean(
    issuedFor.authorized &&
      current.authorized &&
      issuedFor.actorId &&
      issuedFor.countryId &&
      issuedFor.editionId &&
      issuedFor.roundId &&
      issuedFor.actorId === current.actorId &&
      issuedFor.countryId === current.countryId &&
      issuedFor.editionId === current.editionId &&
      issuedFor.roundId === current.roundId &&
      issuedFor.generation === current.generation
  );
}
