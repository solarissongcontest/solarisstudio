/**
 * Actor-private jury receipts must never share a React Query cache entry
 * between delegations, editions, or users who vote in the same show.
 *
 * The server remains the sole authority for receipt lookup and visibility.
 */
export type JuryReceiptScope = {
  actorId: string;
  countryId: string;
  editionId: string;
  showId: string;
};

export function juryReceiptQueryKey({ actorId, countryId, editionId, showId }: JuryReceiptScope) {
  const parts = [actorId, countryId, editionId, showId].map((part) => part.trim());
  if (parts.some((part) => !part) || parts[0] === "anonymous") {
    throw new Error("A signed-in actor, country, edition and show are required for a jury receipt");
  }
  return ["v3-jury-receipt", ...parts] as const;
}
