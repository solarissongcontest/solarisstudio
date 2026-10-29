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
