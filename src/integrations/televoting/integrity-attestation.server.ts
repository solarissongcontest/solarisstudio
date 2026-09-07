import { signVoteIntegrityAttestationServer } from "@/integrations/televoting/preflight.server";

export type FullIntegrityAttestationInput = {
  token: string;
  signedName: string;
  acceptedAutomaticDetection: boolean;
  acceptedIndependence: boolean;
  acceptedCoordination: boolean;
  acceptedPressure: boolean;
  acceptedConsequences: boolean;
};

/**
 * Shared server-side declaration gate for jury and televote.
 * The lower-level signer intentionally remains compatible with older stored
 * statement versions, while every new v4 caller must acknowledge all five
 * independent declarations before a signature can be recorded.
 */
export async function signFullVoteIntegrityAttestationServer(input: FullIntegrityAttestationInput) {
  if (
    !input.acceptedAutomaticDetection ||
    !input.acceptedIndependence ||
    !input.acceptedCoordination ||
    !input.acceptedPressure ||
    !input.acceptedConsequences
  ) {
    throw new Error("All voting-integrity declarations must be acknowledged");
  }

  return signVoteIntegrityAttestationServer({
    token: input.token,
    signedName: input.signedName,
    acceptedAutomaticDetection: true,
    acceptedIndependence: true,
    acceptedConsequences: true,
  });
}
