/** Evidence belongs to the checked-out tree, never an unverified CI label. */
export function resolveS16CandidateSha(checkedOut: string, requested?: string, githubSha?: string) {
  const actual = checkedOut.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(actual)) throw new Error("Invalid checked-out S16 candidate SHA");
  // PR workflows often expose a synthetic merge SHA in GITHUB_SHA. An explicit
  // candidate takes precedence, but must still match the actual checkout.
  const supplied = requested?.trim() || githubSha?.trim();
  if (supplied && supplied.toLowerCase() !== actual) {
    throw new Error("S16 candidate SHA does not match the checked-out tree");
  }
  return actual;
}

/** Generated output is permitted; changed implementation cannot borrow HEAD evidence. */
export function requireS16CleanTree(status: string) {
  const dirty = status.split("\n").filter(Boolean).filter(line => !/^\?\? v3-release-(?:evidence|preflight)\//.test(line));
  if (dirty.length) throw new Error("S16 exact-SHA collection refuses an uncommitted or untracked source tree");
}
