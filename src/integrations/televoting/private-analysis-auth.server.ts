import { getSolarisCapabilitiesServer } from "@/integrations/supabase/capabilities.server";
import type { SolarisCapability } from "@/lib/permissions-v2";

// These specialist views combine raw Televote submissions, confidential jury
// ballots and integrity/risk signals. One partial grant cannot expose another.
export const PRIVATE_VOTING_ANALYSIS_CAPABILITIES = [
  "televote.ballots.read",
  "jury.ballots.read",
  "integrity.read",
] as const satisfies readonly SolarisCapability[];

export async function requirePrivateVotingAnalysisServer() {
  // Resolve all three global grants from one authenticated capability context.
  // Avoid three duplicate network reads on a potentially costly analysis.
  const context = await getSolarisCapabilitiesServer(null);
  const missing = PRIVATE_VOTING_ANALYSIS_CAPABILITIES.filter(
    (capability) => !context.capabilities.includes(capability),
  );
  if (missing.length > 0) {
    throw new Error("Additional Solaris capabilities required for private voting analysis");
  }
  return context;
}
