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

/** v5 risk, confidence and independence are produced on a 0..100 scale. */
export function percentageValue(value: unknown): number {
  const parsed = numberValue(value);
  if (parsed > 100) {
    throw new Error("Jury integrity evidence contains an out-of-range percentage");
  }
  return parsed;
}

/** Current/peer-normalized score proportions are always in the unit interval. */
export function proportionValue(value: unknown): number {
  const parsed = numberValue(value);
  if (parsed > 1) {
    throw new Error("Jury integrity evidence contains an out-of-range proportion");
  }
  return parsed;
}

/** A reported number of peer ballots must be a whole, nonnegative count. */
export function peerCountValue(value: unknown): number {
  const parsed = numberValue(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Jury integrity evidence contains an invalid peer ballot count");
  }
  return parsed;
}

/** Prevent showing mixed-version or partially overwritten integrity evidence. */
export function assertJuryIntegrityV5Evidence(
  stored: { risk: unknown; confidence: unknown },
  evidence: { modelVersion?: unknown; risk?: unknown; confidence?: unknown },
): void {
  if (evidence.modelVersion !== "jury-integrity-model-v5") {
    throw new Error("Jury integrity evidence does not match the v5 model");
  }
  if (
    percentageValue(stored.risk) !== percentageValue(evidence.risk) ||
    percentageValue(stored.confidence) !== percentageValue(evidence.confidence)
  ) {
    throw new Error("Jury integrity evidence disagrees with the canonical preflight");
  }
}
