import { getSolarisCapabilitiesServer } from "@/integrations/supabase/capabilities.server";
import type { SolarisCapability } from "@/lib/permissions-v2";

const PRIVATE_VOTING_ANALYSIS_CAPABILITIES = [
  "televote.ballots.read",
  "jury.ballots.read",
  "integrity.read",
] as const satisfies readonly SolarisCapability[];

/**
 * Private cross-channel voting analysis combines raw Televote ballots,
 * canonical Jury ballots, and integrity/risk metadata. Reading one of those
 * sources must never imply authority to read the others.
 *
 * Resolve the authenticated capability context once to avoid tripling the
 * authorization query cost for every analysis request, then require the whole
 * least-privilege bundle before any private analysis engine is imported.
 */
export async function requirePrivateVotingAnalysisServer() {
  const context = await getSolarisCapabilitiesServer(null);
  const missing = PRIVATE_VOTING_ANALYSIS_CAPABILITIES.filter(
    (capability) => !context.capabilities.includes(capability),
  );

  if (missing.length > 0) {
    throw new Error(
      `Solaris capabilities required for private voting analysis: ${missing.join(", ")}`,
    );
  }

  return context;
}

export { PRIVATE_VOTING_ANALYSIS_CAPABILITIES };
