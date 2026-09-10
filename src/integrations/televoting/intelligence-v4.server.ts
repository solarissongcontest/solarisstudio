import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import type { IntelligenceOptions } from "@/integrations/televoting/intelligence.server";
import { getMergedIntelligenceV5Server } from "@/integrations/televoting/intelligence-v5.server";

/**
 * Compatibility entry point for older imports.
 *
 * The former v4 server rebuilt the complete jury + televote observation universe
 * after `getMergedIntelligenceServer()` had already done the same work. That made
 * broad Friend Voting analysis unnecessarily expensive and was the main source of
 * Worker resource-limit failures. All callers now share the prepared v5 engine.
 */
export async function getMergedIntelligenceV4Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  return getMergedIntelligenceV5Server(options, settings);
}
