import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

type IntelligenceEditionFilter = {
  id: string;
  name: string;
  editionNumber: number | null;
};

export const getMergedTelevotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator((data?: {
    lens?: IntelligenceLens;
    channel?: IntelligenceChannel;
    hodPersonId?: string | null;
    editionId?: string | null;
  }) => ({
    lens: data?.lens === "country" ? "country" as const : "hod" as const,
    channel: data?.channel === "jury" || data?.channel === "televote" ? data.channel : "combined" as const,
    hodPersonId: data?.hodPersonId ? String(data.hodPersonId) : null,
    editionId: data?.editionId ? String(data.editionId) : null,
  }))
  .handler(async ({ data }) => {
    const [
      { getMergedIntelligenceServer },
      { loadFriendVotingSettingsServer },
      { calculateFriendVotingRisk },
      { getCoordinationGroupsServer },
    ] = await Promise.all([
      import("@/integrations/televoting/intelligence.server"),
      import("@/integrations/televoting/friend-voting-settings.server"),
      import("@/integrations/televoting/friend-voting-math"),
      import("@/integrations/televoting/coordination-groups.server"),
    ]);

    const [result, settings] = await Promise.all([
      getMergedIntelligenceServer(data),
      loadFriendVotingSettingsServer(),
    ]);

    const relationships = result.relationships
      .map((row) => {
        const recalculated = calculateFriendVotingRisk({
          uniqueEditions: row.uniqueEditions,
          opportunities: row.opportunities,
          supportFrequency: row.supportFrequency / 100,
          maximumFrequency: row.maximumFrequency / 100,
          reciprocalSupport: row.reciprocalSupport / 100,
          normalizedAverage: row.normalizedAverage / 100,
          crossChannelEditions: row.crossChannelEditions,
        }, settings);
        return {
          ...row,
          riskScore: recalculated.riskScore,
          confidence: recalculated.confidence,
          reasons: recalculated.reasons,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.uniqueEditions - a.uniqueEditions || b.opportunities - a.opportunities);

    const coordination = data.lens === "hod"
      ? await getCoordinationGroupsServer(data, settings)
      : { groups: [], edges: [], stats: { knownControllerObservations: 0, knownControllerEdges: 0, qualifiedEdges: 0, groups: 0 } };

    return {
      ...result,
      relationships,
      stats: {
        ...result.stats,
        relationships: relationships.length,
        attentionRelationships: relationships.filter((row) => row.riskScore >= settings.riskReview).length,
      },
      settings,
      coordination,
      filters: {
        ...result.filters,
        editions: result.filters.editions as IntelligenceEditionFilter[],
      },
    };
  });