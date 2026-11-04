/**
 * Cross-check successful release evidence against its own diagnostic payload.
 *
 * An affirmative boolean on its own is not certification: a malformed or
 * partially generated report can retain blockers while setting that boolean.
 * This function deliberately does not recompute the underlying scans. It
 * rejects internally contradictory claims before S16 trusts their artifacts.
 */
type Evidence = Record<string, unknown>;

function record(value: unknown): Evidence | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Evidence
    : null;
}

export function releaseEvidenceConsistencyFailure(
  filename: string,
  evidence: Evidence,
): string | null {
  if (filename === "s15-zero-orphan.json" && evidence.zeroOrphans === true) {
    if (!Array.isArray(evidence.findings) || evidence.findings.length !== 0) {
      return "s15-zero-orphan.json claims zeroOrphans=true without an empty findings array";
    }
    const physical = record(evidence.physicalOwnership);
    if (!physical || physical.zeroOwnershipConflicts !== true) {
      return "s15-zero-orphan.json claims zeroOrphans=true without clean physical ownership";
    }
  }

  if (filename === "security-advisor-classification.json" && evidence.releaseReady === true) {
    const counts = record(evidence.counts);
    if (
      !counts ||
      !Number.isSafeInteger(counts.findings) ||
      (counts.findings as number) < 0 ||
      !Number.isSafeInteger(counts.releaseBlocking) ||
      (counts.releaseBlocking as number) !== 0
    ) {
      return "security-advisor-classification.json claims releaseReady=true with invalid or nonzero blocking counts";
    }
    if (
      !Array.isArray(evidence.findings) ||
      evidence.findings.length !== counts.findings
    ) {
      return "security-advisor-classification.json has inconsistent finding counts";
    }
    for (const finding of evidence.findings) {
      const disposition = record(record(finding)?.disposition);
      if (
        !disposition ||
        (disposition.status !== "remediated" &&
          disposition.status !== "intentional-and-proven")
      ) {
        return "security-advisor-classification.json claims releaseReady=true with an unclassified or blocking finding";
      }
    }
  }

  return null;
}
