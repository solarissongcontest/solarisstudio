/**
 * Organizer response reads must fail visibly rather than making a failed
 * exact-edition RPC look like an empty queue.
 */
export function describeConfirmationResponseLoadFailure(caught: unknown): string {
  const details = caught && typeof caught === "object"
    ? caught as { code?: unknown; message?: unknown }
    : null;
  const code = typeof details?.code === "string" ? details.code : null;

  if (code === "PGRST202" || code === "42883") {
    return "The server does not have the exact-edition Confirmation response endpoint. A controlled database deployment is required; the response queue has not been verified.";
  }
  if (code === "42501" || code === "PGRST301") {
    return "Access to this edition's Confirmation responses was denied. Check your Organizer permissions or sign in again.";
  }

  const message = typeof details?.message === "string"
    ? details.message
    : caught instanceof Error ? caught.message : "";
  if (/failed to fetch|network|timeout/i.test(message)) {
    return "Could not connect to the Confirmation response service. Check your connection and retry.";
  }
  return message.trim() || "Exact-edition responses could not be loaded.";
}

export function confirmationResponseCountLabel(count: number, loaded: boolean): string {
  return loaded ? String(count) : "—";
}
