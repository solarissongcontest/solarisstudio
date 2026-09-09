import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

type IntelligenceEditionFilter = { id: string; name: string; editionNumber: number | null };
type IntelligenceInput = {
  lens?: IntelligenceLens;
  channel?: IntelligenceChannel;
  hodPersonId?: string | null;
  editionId?: string | null;
};

type CoordinationPayload = {
  groups: any[];
  edges: any[];
  stats: {
    modelVersion: string;
    editionDecay: number;
    knownControllerObservations: number;
    knownControllerEdges: number;
    qualifiedEdges: number;
    groups: number;
  };
  analysisDegraded: boolean;
  analysisWarning: string | null;
};

const LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250;

const normalizeInput = (data?: IntelligenceInput) => ({
  lens: data?.lens === "country" ? "country" as const : "hod" as const,
  channel: data?.channel === "jury" || data?.channel === "televote" ? data.channel : "combined" as const,
  hodPersonId: data?.hodPersonId ? String(data.hodPersonId) : null,
  editionId: data?.editionId ? String(data.editionId) : null,
});

const emptyCoordination = (warning: string | null = null): CoordinationPayload => ({
  groups: [],
  edges: [],
  stats: {
    modelVersion: "friend-voting-model-v4",
    editionDecay: 0.88,
    knownControllerObservations: 0,
    knownControllerEdges: 0,
    qualifiedEdges: 0,
    groups: 0,
  },
  analysisDegraded: Boolean(warning),
  analysisWarning: warning,
});

function isBroadDefaultScope(data: ReturnType<typeof normalizeInput>) {
  return data.lens === "hod" && data.channel === "combined" && !data.editionId && !data.hodPersonId;
}

async function getResilientFriendVotingIntelligence(data: ReturnType<typeof normalizeInput>) {
  const [
    { getMergedIntelligenceV4Server },
    { getMergedIntelligenceServer },
    { loadFriendVotingSettingsServer },
  ] = await Promise.all([
    import("@/integrations/televoting/intelligence-v4.server"),
    import("@/integrations/televoting/intelligence.server"),
    import("@/integrations/televoting/friend-voting-settings.server"),
  ]);
  const settings = await loadFriendVotingSettingsServer();

  // The all-editions + combined + HOD scope is intentionally served by the
  // base historical model. Starting v4 and then racing a timeout is unsafe on
  // Cloudflare because Promise.race does not cancel the expensive computation;
  // a fallback would run concurrently and can push the Worker into Error 1102.
  if (isBroadDefaultScope(data)) {
    const result = await getMergedIntelligenceServer({
      ...data,
      advancedModel: settings.advancedModel,
    });
    if (!result) throw new Error("Friend-voting analysis returned no data");
    return {
      result,
      settings,
      analysisDegraded: true,
      analysisWarning:
        "Full-history HOD + jury/televote scope uses the resource-safe historical model. Narrow the edition, channel or HOD scope for full v4 scoring.",
    };
  }

  try {
    // Do not use Promise.race timeouts here. A timed-out calculation would keep
    // consuming Worker CPU while the fallback starts, which is worse than one
    // bounded request and was the source of production Error 1102 failures.
    const result = await getMergedIntelligenceV4Server(data, settings);
    if (!result) throw new Error("Advanced friend-voting analysis returned no data");
    return { result, settings, analysisDegraded: false, analysisWarning: null as string | null };
  } catch (error) {
    console.error("Advanced friend-voting analysis failed; falling back to base model", error);
    const result = await getMergedIntelligenceServer({
      ...data,
      advancedModel: settings.advancedModel,
    });
    if (!result) throw new Error("Friend-voting analysis returned no data");
    return {
      result,
      settings,
      analysisDegraded: true,
      analysisWarning: error instanceof Error ? error.message : "Advanced analysis unavailable",
    };
  }
}

export const getMergedTelevotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    const [{ getCoordinationGroupsServer }, resilient] = await Promise.all([
      import("@/integrations/televoting/coordination-groups.server"),
      getResilientFriendVotingIntelligence(data),
    ]);
    const { result, settings, analysisDegraded, analysisWarning } = resilient;
    let coordination: CoordinationPayload = emptyCoordination();
    if (data.lens === "hod") {
      try {
        const network = await getCoordinationGroupsServer(data, settings);
        coordination = {
          ...network,
          analysisDegraded: false,
          analysisWarning: null,
        };
      } catch (error) {
        console.error("Friend-voting network analysis failed", error);
        coordination = emptyCoordination(
          error instanceof Error ? error.message : "Network analysis unavailable",
        );
      }
    }
    return {
      ...result,
      stats: {
        ...result.stats,
        relationships: result.relationships.length,
        attentionRelationships: result.relationships.filter((row) => row.riskScore >= settings.riskReview).length,
      },
      settings,
      coordination,
      analysisDegraded,
      analysisWarning,
      filters: { ...result.filters, editions: result.filters.editions as IntelligenceEditionFilter[] },
    };
  });

export const getLightweightFriendVotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    const { result, settings, analysisDegraded, analysisWarning } = await getResilientFriendVotingIntelligence(data);
    const allRelationships = result.relationships;
    return {
      ...result,
      relationships: allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT),
      stats: {
        ...result.stats,
        relationships: allRelationships.length,
        attentionRelationships: allRelationships.filter((row) => row.riskScore >= settings.riskReview).length,
      },
      settings,
      coordination: emptyCoordination(),
      analysisDegraded,
      analysisWarning,
      filters: { ...result.filters, editions: result.filters.editions as IntelligenceEditionFilter[] },
    };
  });

export const getFriendVotingCoordination = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    if (data.lens !== "hod") return emptyCoordination();
    const [{ getCoordinationGroupsServer }, { loadFriendVotingSettingsServer }] = await Promise.all([
      import("@/integrations/televoting/coordination-groups.server"),
      import("@/integrations/televoting/friend-voting-settings.server"),
    ]);
    const settings = await loadFriendVotingSettingsServer();
    try {
      const result = await getCoordinationGroupsServer(data, settings);
      if (!result) throw new Error("Network analysis returned no data");
      return {
        ...result,
        analysisDegraded: false,
        analysisWarning: null,
      };
    } catch (error) {
      console.error("Friend-voting network analysis failed", error);
      return emptyCoordination(
        error instanceof Error ? error.message : "Network analysis unavailable",
      );
    }
  });
