/** A failed authorization read is unavailable, even if a previous grant is cached. */
export function organizerAccessDecision(query: {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  data: boolean | undefined;
}): "checking" | "unavailable" | "allowed" | "denied" {
  if (query.isPending) return "checking";
  if (query.isError) return query.isFetching ? "checking" : "unavailable";
  if (query.data === true) return "allowed";
  if (query.data === false) return "denied";
  return "unavailable";
}
