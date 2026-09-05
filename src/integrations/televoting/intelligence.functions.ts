import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";
type IntelligenceEditionFilter = { id: string; name: string; editionNumber: number | null };
export const getMergedTelevotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator((data?: { lens?: IntelligenceLens; channel?: IntelligenceChannel; hodPersonId?: string | null; editionId?: string | null }) => ({ lens: data?.lens === "country" ? "country" as const : "hod" as const, channel: data?.channel === "jury" || data?.channel === "televote" ? data.channel : "combined" as const, hodPersonId: data?.hodPersonId ? String(data.hodPersonId) : null, editionId: data?.editionId ? String(data.editionId) : null }))
  .handler(async ({ data }) => {
    const [{ getMergedIntelligenceServer }, { loadFriendVotingSettingsServer }, { getCoordinationGroupsServer }] = await Promise.all([
      import("@/integrations/televoting/intelligence.server"), import("@/integrations/televoting/friend-voting-settings.server"), import("@/integrations/televoting/coordination-groups.server"),
    ]);
    const settings = await loadFriendVotingSettingsServer();
    const result = await getMergedIntelligenceServer({ ...data, advancedModel: settings.advancedModel });
    const coordination = data.lens === "hod" ? await getCoordinationGroupsServer(data, settings) : { groups: [], edges: [], stats: { knownControllerObservations: 0, knownControllerEdges: 0, qualifiedEdges: 0, groups: 0 } };
    return {
      ...result,
      stats: { ...result.stats, relationships: result.relationships.length, attentionRelationships: result.relationships.filter((row) => row.riskScore >= settings.riskReview).length },
      settings, coordination, filters: { ...result.filters, editions: result.filters.editions as IntelligenceEditionFilter[] },
    };
  });
