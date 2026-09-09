import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

type IntelligenceEditionFilter = { id: string; name: string; editionNumber: number | null };
type IntelligenceInput = {
  lens?: IntelligenceLens;
  channel?: IntelligenceChannel;
  hodPersonId?: string | null;
  editionId?: string | null;
};

type NormalizedInput = ReturnType<typeof normalizeInput>;
type AnalysisMode = "historical" | "advanced" | "fallback";
type RiskSemantics = "pattern" | "advanced-risk";

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

function isWorkerHeavyDefaultScope(data: NormalizedInput) {
  return data.lens === "hod" && data.channel === "combined" && !data.editionId && !data.hodPersonId;
}

function isHistoricalAllEditionsScope(data: NormalizedInput) {
  return data.lens === "country" && !data.editionId && !data.hodPersonId && (data.channel === "combined" || data.channel === "televote");
}

function workerSafeHistoricalScope(): NormalizedInput {
  return {
    lens: "country",
    channel: "combined",
    hodPersonId: null,
    editionId: null,
  };
}

function sanitizeResultForScope(result: any, scope: NormalizedInput) {
  const stats = { ...result.stats };

  if (scope.channel === "televote") {
    stats.juryBallots = 0;
    stats.juryVotes = 0;
  }

  if (scope.channel === "jury") {
    stats.ballots = 0;
    stats.active = 0;
    stats.deleted = 0;
    stats.suspicious = 0;
    stats.verified = 0;
    stats.highRisk = 0;
    stats.vpn = 0;
  }

  const technicalTelevoteSignalKeys = new Set([
    "suspicious",
    "high-risk",
    "vpn",
    "username-cross-country",
  ]);

  const signals = scope.channel === "jury"
    ? (result.signals ?? []).filter((signal: any) => !technicalTelevoteSignalKeys.has(String(signal.key)))
    : (result.signals ?? []);

  return {
    ...result,
    stats,
    signals,
    filters: {
      ...result.filters,
      lens: scope.lens,
      channel: scope.channel,
      hodPersonId: scope.hodPersonId,
      editionId: scope.editionId,
    },
  };
}

async function runHistoricalAnalysis(data: NormalizedInput, settings: any) {
  const { getMergedIntelligenceServer } = await import("@/integrations/televoting/intelligence.server");
  const result = await getMergedIntelligenceServer({
    ...data,
    advancedModel: settings.advancedModel,
  });
  if (!result) throw new Error("Friend-voting analysis returned no data");
  return sanitizeResultForScope(result, data);
}

async function getResilientFriendVotingIntelligence(
  requested: NormalizedInput,
  options: { allowAdvanced?: boolean } = {},
) {
  const { loadFriendVotingSettingsServer } = await import("@/integrations/televoting/friend-voting-settings.server");
  const settings = await loadFriendVotingSettingsServer();

  const effectiveScope = isWorkerHeavyDefaultScope(requested)
    ? workerSafeHistoricalScope()
    : requested;

  // Lightweight Organizer requests deliberately use the historical relationship model.
  // Do not start an expensive v4 computation and race it against a fallback: Promise.race
  // does not cancel the losing work and previously exhausted the Cloudflare Worker.
  if (!options.allowAdvanced || isWorkerHeavyDefaultScope(requested) || isHistoricalAllEditionsScope(effectiveScope)) {
    const result = await runHistoricalAnalysis(effectiveScope, settings);
    return {
      result,
      settings,
      effectiveScope,
      analysisMode: "historical" as AnalysisMode,
      riskSemantics: "pattern" as RiskSemantics,
      analysisDegraded: false,
      analysisWarning: isWorkerHeavyDefaultScope(requested)
        ? "Showing the worker-safe country-level jury + televote history across all editions. This includes the corrected SSC20 and SSC21 historical televote ballots plus the longer jury baseline."
        : null,
    };
  }

  try {
    const { getMergedIntelligenceV4Server } = await import("@/integrations/televoting/intelligence-v4.server");
    const advanced = await getMergedIntelligenceV4Server(effectiveScope, settings);
    if (!advanced) throw new Error("Advanced friend-voting analysis returned no data");
    return {
      result: sanitizeResultForScope(advanced, effectiveScope),
      settings,
      effectiveScope,
      analysisMode: "advanced" as AnalysisMode,
      riskSemantics: "advanced-risk" as RiskSemantics,
      analysisDegraded: false,
      analysisWarning: null as string | null,
    };
  } catch (error) {
    console.error("Advanced friend-voting analysis failed; using historical relationship analysis", error);
    const result = await runHistoricalAnalysis(effectiveScope, settings);
    return {
      result,
      settings,
      effectiveScope,
      analysisMode: "fallback" as AnalysisMode,
      riskSemantics: "pattern" as RiskSemantics,
      analysisDegraded: true,
      analysisWarning: error instanceof Error ? error.message : "Advanced analysis unavailable",
    };
  }
}

function addCommonMetadata(payload: any, resilient: Awaited<ReturnType<typeof getResilientFriendVotingIntelligence>>) {
  const { settings, effectiveScope, analysisMode, riskSemantics, analysisDegraded, analysisWarning } = resilient;
  return {
    ...payload,
    settings,
    effectiveScope,
    analysisMode,
    riskSemantics,
    technicalIntegrityAvailable: effectiveScope.channel !== "jury",
    analysisDegraded,
    analysisWarning,
    filters: { ...payload.filters, editions: payload.filters.editions as IntelligenceEditionFilter[] },
  };
}

export const getMergedTelevotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    const resilient = await getResilientFriendVotingIntelligence(data, { allowAdvanced: true });
    const { result, settings, effectiveScope } = resilient;
    let coordination: CoordinationPayload = emptyCoordination();

    if (effectiveScope.lens === "hod") {
      if (!effectiveScope.editionId && !effectiveScope.hodPersonId) {
        coordination = emptyCoordination(
          "Network analysis requires a narrower scope. Select an edition or a specific HOD before opening Network.",
        );
      } else {
        try {
          const { getCoordinationGroupsServer } = await import("@/integrations/televoting/coordination-groups.server");
          const network = await getCoordinationGroupsServer(effectiveScope, settings);
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

    const payload = {
      ...result,
      stats: {
        ...result.stats,
        relationships: result.relationships.length,
        attentionRelationships: result.relationships.filter((row: any) => row.riskScore >= settings.riskReview).length,
      },
      coordination,
    };

    return addCommonMetadata(payload, resilient);
  });

export const getLightweightFriendVotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    const resilient = await getResilientFriendVotingIntelligence(data, { allowAdvanced: false });
    const { result, settings } = resilient;
    const allRelationships = result.relationships;
    const payload = {
      ...result,
      relationships: allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT),
      stats: {
        ...result.stats,
        relationships: allRelationships.length,
        attentionRelationships: allRelationships.filter((row: any) => row.riskScore >= settings.riskReview).length,
      },
      coordination: emptyCoordination(),
    };
    return addCommonMetadata(payload, resilient);
  });

export const getFriendVotingCoordination = createServerFn({ method: "POST" })
  .inputValidator(normalizeInput)
  .handler(async ({ data }) => {
    if (data.lens !== "hod") return emptyCoordination();

    if (!data.editionId && !data.hodPersonId) {
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
