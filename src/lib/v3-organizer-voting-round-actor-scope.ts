/**
 * Identity is part of the private Organizer voting-round read boundary.
 *
 * The same edition and round must never share scope-verification data between
 * different signed-in users. This key contains no ballot or token material.
 */
export function votingRoundActorScopeKey(
  actorId: string | null | undefined,
  editionId: string | null | undefined,
  roundId: string | null | undefined,
) {
  return [
    "v3-organizer-voting-round-scope",
    actorId?.trim() || "signed-out",
    editionId?.trim() || "unscoped",
    roundId?.trim() || "missing-round",
  ] as const;
}
