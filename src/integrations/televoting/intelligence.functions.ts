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
const ADVANCED_ANALYSIS_TIMEOUT_MS = 7_000;
const NETWORK_ANALYSIS_TIMEOUT_MS = 8_000;

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

function isWorkerHeavyDefaultScope(data: ReturnType<typeof normalizeInput>) {
  return data.lens === "hod" && data.channel === "combined" && !data.editionId && !data.hodPersonId;
}

function workerSafeHistoricalScope() {
  return {
    lens: "country" as const,
    channel: "combined" as const,
    hodPersonId: null,
    editionId: null,
  };
}

async function resolveLatestCompletedEditionScope(data: ReturnType<typeof normalizeInput>) {
  if (!isWorkerHeavyDefaultScope(data)) return data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: edition, error } = await db
    .from("editions")
    .select("id,edition_number,name,status")
    .eq("status", "completed")
    .not("edition_number", "is", null)
    .order("edition_number", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!edition?.id) throw new Error("No completed Solaris edition could be resolved for Friend Voting");
  return {
    ...data,
    editionId: String(edition.id),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
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

  // The all-editions HOD + combined model is too expensive for a page-load Worker
  // request because it constructs controller history and jury/televote relationships
  // together. Use the complete country-level combined history instead. This preserves
  // the long jury baseline (where historical data exists) and adds televote evidence
  // for editions whose public ballots are stored, including SSC20 and SSC21.
  if (isWorkerHeavyDefaultScope(data)) {
    const safeScope = workerSafeHistoricalScope();
    const result = await getMergedIntelligenceServer({
      ...safeScope,
      advancedModel: settings.advancedModel,
    });
    if (!result) throw new Error("Friend-voting analysis returned no data");
    return {
      result,
      settings,
      analysisDegraded: true,
      analysisWarning:
        "Worker-safe historical view: country-level jury + televote evidence is combined across all available editions. Historical jury data supplies the long baseline; televote evidence is included where public ballots are stored. Select a specific edition or HOD for the heavier HOD-aware model.",
    };
  }

  try {
    const result = await withTimeout(
      getMergedIntelligenceV4Server(data, settings),
      ADVANCED_ANALYSIS_TIMEOUT_MS,
      "Advanced friend-voting analysis",
    );
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
      if (isWorkerHeavyDefaultScope(data)) {
        coordination = emptyCoordination(
          "Network analysis is paused for the all-editions combined HOD scope. Select an edition or a specific HOD to build the network safely.",
        );
      } else {
        try {
          const network = await withTimeout(
            getCoordinationGroupsServer(data, settings),
            NETWORK_ANALYSIS_TIMEOUT_MS,
            "Friend-voting network analysis",
          );
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

    if (isWorkerHeavyDefaultScope(data)) {
      return emptyCoordination(
        "Network analysis requires a narrower scope. Select an edition or a specific HOD before opening Network.",
      );
    }

    const [{ getCoordinationGroupsServer }, { loadFriendVotingSettingsServer }] = await Promise.all([
      import("@/integrations/televoting/coordination-groups.server"),
      import("@/integrations/televoting/friend-voting-settings.server"),
    ]);
    const settings = await loadFriendVotingSettingsServer();
    try {
      const result = await withTimeout(
        getCoordinationGroupsServer(data, settings),
        NETWORK_ANALYSIS_TIMEOUT_MS,
        "Friend-voting network analysis",
      );
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