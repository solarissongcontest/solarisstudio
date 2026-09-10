import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import {
  getMergedIntelligenceServer,
  type IntelligenceOptions,
} from "@/integrations/televoting/intelligence.server";

export const FRIEND_VOTING_ENGINE_VERSION = "friend-voting-engine-v5-prepared";

/**
 * Advanced Friend Voting v5 deliberately reuses the primary intelligence engine.
 *
 * The old v4 server performed a complete base analysis and then loaded the jury and
 * televote universe a second time to rebuild advanced observations. That duplicate
 * pass was the main source of broad-scope Worker pressure. The primary engine already
 * builds one canonical observation set, one reverse-relationship index and one shared
 * advanced-history array. The advanced risk model caches its prepared global history,
 * so every relationship reuses that context rather than rebuilding it.
 *
 * This entry point forces advanced mode for every requested scope. Historical mode is
 * selected only by the caller when this advanced request fails and a fallback is needed.
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
        modelVersion: result.historyWeighting.modelVersion,
        durationMs: Date.now() - startedAt,
        relationships: result.relationships.length,
        // Cross-era scoring is normalized inside the advanced model from score/maxScore,
        // so SSC20 legacy values, SSC21 Story ratings, jury points and modern televote
        // points are compared on relative intensity/rank rather than raw-point magnitude.
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
