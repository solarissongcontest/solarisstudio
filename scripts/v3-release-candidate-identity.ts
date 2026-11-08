/**
 * Exact-SHA release evidence must describe the source actually checked out.
 * An environment-provided candidate identifier is a claim, not proof that
 * the current process is inspecting the corresponding repository revision.
 */
export type V3ReleaseCandidateIdentityInput = {
  checkedOutSha: string | null;
  requestedCandidateSha: string | null;
  strictRelease: boolean;
};

export type V3ReleaseCandidateIdentity = {
  checkedOutSha: string | null;
  requestedCandidateSha: string | null;
  evidenceCandidateSha: string | null;
  errors: string[];
};

const EXACT_SHA = /^[0-9a-f]{40}$/;

function normalizeSha(raw: string | null): string | null {
  return raw?.trim().toLowerCase() || null;
}

export function resolveV3ReleaseCandidateIdentity(
  input: V3ReleaseCandidateIdentityInput,
): V3ReleaseCandidateIdentity {
  const checkedOutSha = normalizeSha(input.checkedOutSha);
  const requestedCandidateSha = normalizeSha(input.requestedCandidateSha);
  const errors: string[] = [];

  if (checkedOutSha && !EXACT_SHA.test(checkedOutSha)) {
    errors.push("checked-out Git HEAD is not an exact 40-character commit SHA");
  }
  if (requestedCandidateSha && !EXACT_SHA.test(requestedCandidateSha)) {
    errors.push("V3_CANDIDATE_SHA is not an exact 40-character commit SHA");
  }
  if (!checkedOutSha && (input.strictRelease || requestedCandidateSha)) {
    errors.push(
      "cannot verify checked-out Git HEAD for the requested candidate; " +
        "environment identifiers alone cannot certify repository source",
    );
  }
  if (checkedOutSha && requestedCandidateSha && checkedOutSha !== requestedCandidateSha) {
    errors.push(
      `V3_CANDIDATE_SHA ${requestedCandidateSha} does not match checked-out SHA ${checkedOutSha}`,
    );
  }

  return {
    checkedOutSha,
    requestedCandidateSha,
    evidenceCandidateSha: errors.length === 0 ? requestedCandidateSha || checkedOutSha : null,
    errors,
  };
}
