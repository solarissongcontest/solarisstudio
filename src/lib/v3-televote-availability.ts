/**
 * The public booth must only open on an explicit successful backend check.
 * Local cache, round visibility and the absence of an exception are not
 * substitutes for positive voting readiness.
 */
export type TelevotingAvailability = "checking" | "ready" | "unavailable" | "error";

export function resolveTelevotingAvailability(
  status: { votingReady: boolean } | null | undefined,
  pending: boolean,
  errored: boolean,
): TelevotingAvailability {
  if (errored || (!pending && !status)) return "error";
  if (pending || !status) return "checking";
  return status.votingReady === true ? "ready" : "unavailable";
}
