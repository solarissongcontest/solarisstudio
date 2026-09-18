import { FRIEND_VOTING_MODEL_VERSION } from "@/integrations/televoting/advanced-friend-voting";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import {
  getMergedIntelligenceServer,
  type IntelligenceOptions,
} from "@/integrations/televoting/intelligence.server";

export const FRIEND_VOTING_ENGINE_VERSION = "friend-voting-engine-v5-prepared";

/**
 * Advanced Friend Voting v5 reuses the primary intelligence engine.
 *
 * The former v4 server performed a full base analysis and then loaded the
 * canonical jury + televote universe again to rebuild advanced observations.
 * The primary engine already builds the indexed observation set and the
 * advanced model caches its prepared history, so rebuilding the universe only
 * wasted Worker CPU and memory.
 */
export async function getMergedIntelligenceV5Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `fv-${Date.now().toString(36)}`;
  const startedAt = Date.now();

  try {
    const result = await getMergedIntelligenceServer({
      ...options,
      advancedModel: {
        ...settings.advancedModel,
        mode: "advanced",
      },
    });

    return {
      ...result,
      diagnostics: {
        requestId,
        engineVersion: FRIEND_VOTING_ENGINE_VERSION,
        modelVersion: FRIEND_VOTING_MODEL_VERSION,
        durationMs: Date.now() - startedAt,
        relationships: result.relationships.length,
        normalizedCrossScaleScores: true,
        historicalSourcesIncluded: true,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[friend-voting-v5] advanced analysis failed", {
      requestId,
      durationMs: Date.now() - startedAt,
      message,
      error,
    });

    const wrapped = new Error(
      `Friend Voting advanced analysis failed. Request ${requestId}. ${message}`,
    ) as Error & { statusCode?: number };
    wrapped.statusCode = 500;
    throw wrapped;
  }
}
