/** Verify that a V3 completion dashboard labels only the source actually inspected. */
const SHA = /^[0-9a-f]{40}$/i;

export function resolveDashboardExactSha(
  checkedOutSha: string | null,
  declaredGithubSha: string | undefined,
): string {
  const checkout = checkedOutSha?.trim().toLowerCase() || null;
  const declared = declaredGithubSha?.trim().toLowerCase() || null;

  if (checkout && !SHA.test(checkout)) {
    throw new Error("V3 dashboard checkout identity is not a full 40-character Git SHA");
  }
  if (declared && !SHA.test(declared)) {
    throw new Error("V3 dashboard GITHUB_SHA is invalid; refusing misleading release evidence");
  }
  if (declared && !checkout) {
    throw new Error("V3 dashboard cannot attest GITHUB_SHA without a verified Git checkout");
  }
  if (declared && checkout && declared !== checkout) {
    throw new Error(
      `V3 dashboard GITHUB_SHA ${declared} does not match inspected checkout ${checkout}`,
    );
  }

  // A dashboard outside a Git checkout can still describe inventory, but must
  // never pretend to certify an exact candidate.
  return checkout ?? "unknown";
}
