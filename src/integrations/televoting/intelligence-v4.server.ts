import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import type { IntelligenceOptions } from "@/integrations/televoting/intelligence.server";
import { getMergedIntelligenceV5Server } from "@/integrations/televoting/intelligence-v5.server";

/**
 * Compatibility entry point for older imports.
 *
 * V4 used to rebuild the complete jury + televote observation universe after
 * getMergedIntelligenceServer() had already prepared the same data. All callers
 * now share the single prepared V5 engine.
 */
export async function getMergedIntelligenceV4Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  return getMergedIntelligenceV5Server(options, settings);
}
