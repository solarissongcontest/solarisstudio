/**
 * An S11 recovery-readiness inventory is source evidence, not a release
 * certificate. It must nevertheless identify the exact checked-out source:
 * callers cannot attach an arbitrary valid-looking candidate SHA.
 */
const SHA = /^[0-9a-f]{40}$/;

export function verifyV3RecoveryEvidenceCommit(
  declaredCommit: string,
  checkoutCommit: string,
): string {
  const declared = declaredCommit.trim().toLowerCase();
  const checkout = checkoutCommit.trim().toLowerCase();

  if (!SHA.test(declared)) {
    throw new Error("V3_RECOVERY_EVIDENCE_SHA must be an exact 40-character commit SHA");
  }
  if (!SHA.test(checkout)) {
    throw new Error("cannot verify the exact Git checkout SHA for S11 evidence");
  }
  if (declared !== checkout) {
    throw new Error(
      `V3_RECOVERY_EVIDENCE_SHA ${declared} does not match checked-out HEAD ${checkout}`,
    );
  }
  return checkout;
}
