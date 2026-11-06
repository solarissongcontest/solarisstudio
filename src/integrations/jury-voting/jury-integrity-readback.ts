/**
 * Jury Integrity v5 persists numeric evidence through PostgREST.
 * Reject missing and corrupt values rather than presenting a convincing
 * zero-risk / zero-score finding to the producer.
 */
export function numberValue(value: unknown): number {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && value.trim().length > 0)
  ) {
    throw new Error("Jury integrity evidence contains a missing or invalid number");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Jury integrity evidence contains a missing or invalid number");
  }
  return parsed;
}
