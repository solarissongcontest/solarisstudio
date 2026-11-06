/**
 * Organizer's shared gate must recheck authorization when the real account
 * identity changes without a URL transition. This is a presentation guard:
 * every privileged RPC and private read still enforces server permissions.
 */
export function shouldRevalidateOrganizerGate(
  event: string,
  observedActorId: string | null,
  nextActorId: string | null,
): boolean {
  if (event === "SIGNED_OUT" || event === "USER_UPDATED") return true;
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
    return nextActorId !== observedActorId;
  }
  // INITIAL_SESSION is already covered by the gate's first authorized read.
  return false;
}
