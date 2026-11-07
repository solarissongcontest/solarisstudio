/**
 * S11 recovery readiness is evidence about the source tree actually inspected.
 * A caller-provided candidate label cannot attest an unrelated checkout.
 */
export function requireV3RecoveryEvidenceIdentity(
  requestedSha: string,
  checkedOutSha: string,
): string {
  const requested = requestedSha.trim().toLowerCase();
  const checkedOut = checkedOutSha.trim().toLowerCase();
  const fullSha = /^[0-9a-f]{40}$/;

  if (!fullSha.test(requested)) {
    throw new Error("V3_RECOVERY_EVIDENCE_SHA must be a complete 40-character Git SHA");
  }
  if (!fullSha.test(checkedOut)) {
    throw new Error("S11 recovery evidence requires a verified 40-character Git checkout HEAD");
  }
  if (requested !== checkedOut) {
    throw new Error(
      `S11 recovery evidence candidate ${requested} does not match checkout HEAD ${checkedOut}`,
    );
  }
  return checkedOut;
}

/** A labelled recovery artifact cannot attest uncommitted or untracked source. */
export function requireV3RecoveryCleanTree(gitStatus: string): void {
  const disallowed = gitStatus.split("\n")
    .filter(Boolean)
    .filter((line) => !/^\?\? v3-release-(?:evidence|preflight)\//.test(line));
  if (disallowed.length > 0) {
    throw new Error("S11 recovery evidence refuses a dirty or untracked source checkout");
  }
}
