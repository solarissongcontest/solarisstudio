import { createServerFn } from "@tanstack/react-start";
import type { CorrectionScope, SourceInputMode } from "@/integrations/televoting/combined-math";

function boundedCombinedPointPool(value: unknown) {
  const points = Number(value);
  const integralPoints = Math.trunc(points);
  if (!Number.isFinite(points) || points < 1 || !Number.isSafeInteger(integralPoints)) {
    throw new Error("Invalid Combined Results point pool");
  }
  return integralPoints;
}

function boundedCombinedRankExponent(value: unknown) {
  const exponent = Number(value);
  if (!Number.isFinite(exponent) || exponent <= 0) {
    throw new Error("Invalid Combined Results rank exponent");
  }
  return exponent;
}

async function requireCombinedCapability(capability: "voting.read" | "voting.manage") {
  const { requireSolarisCapabilityServer } = await import("@/integrations/supabase/capabilities.server");
  await requireSolarisCapabilityServer(capability, null);
}

async function refreshCombinedCanonicalParticipants(aggregationId: string) {
  const { syncEditableCombinedParticipantsFromSolarisServer } = await import(
    "@/integrations/televoting/combined-sync.server"
  );
  return syncEditableCombinedParticipantsFromSolarisServer(aggregationId);
}

export const listMergedCombinedAggregations = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string }) => {
    const editionId = String(data?.editionId ?? "").trim();
    if (!editionId) throw new Error("Combined Results requires an exact Solaris edition");
    return { editionId };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.read");
    const { listMergedCombinedAggregationsServer } = await import("@/integrations/televoting/combined.server");
    return listMergedCombinedAggregationsServer(data.editionId);
  });

export const getMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; editionId: string }) => {
    const id = String(data?.id ?? "").trim();
    const editionId = String(data?.editionId ?? "").trim();
    if (!id) throw new Error("Missing aggregation id");
    if (!editionId) throw new Error("Combined detail requires an exact Solaris edition");
    return { id, editionId };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.read");
    const { getMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return getMergedCombinedAggregationServer(data.id, data.editionId);
  });

export const createMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; editionId: string; totalPoints: number; rankExponent: number }) => {
    const name = String(data?.name ?? "").trim();
    const editionId = String(data?.editionId ?? "").trim();
    if (!name) throw new Error("Name is required");
    if (!editionId) throw new Error("Combined creation requires an exact Solaris edition");
    const totalPoints = boundedCombinedPointPool(data.totalPoints);
    const rankExponent = boundedCombinedRankExponent(data.rankExponent);
    return { name, editionId, totalPoints, rankExponent };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { createMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return createMergedCombinedAggregationServer(data);
  });

export const updateMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string; totalPoints: number; rankExponent: number }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Name is required");
    const totalPoints = boundedCombinedPointPool(data.totalPoints);
    const rankExponent = boundedCombinedRankExponent(data.rankExponent);
    return { id: data.id, name, totalPoints, rankExponent };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { updateMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return updateMergedCombinedAggregationServer(data);
  });

export const setMergedCombinedParticipants = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; participants: string[] }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    const participants = [...new Set((data.participants ?? []).map(String).filter(Boolean))];
    return { id: data.id, participants };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const canonicalSync = await refreshCombinedCanonicalParticipants(data.id);
    if (canonicalSync.status === "synced" || canonicalSync.status === "up_to_date") {
      throw new Error(
        "Participants are managed by the linked Solaris show. Edit the show lineup in Solaris Studio instead.",
      );
    }
    if (canonicalSync.status === "immutable") {
      throw new Error("Locked or published Combined participant snapshots cannot be edited.");
    }
    const { setMergedCombinedParticipantsServer } = await import("@/integrations/televoting/combined.server");
    return setMergedCombinedParticipantsServer(data);
  });

export const upsertMergedCombinedSource = createServerFn({ method: "POST" })
  .inputValidator((data: {
    id?: string | null;
    aggregationId: string;
    sourceType: string;
    inputMode: SourceInputMode;
    roundId?: string | null;
    name: string;
    weight: number;
    enabled: boolean;
    displayOrder: number;
    correctionScope?: CorrectionScope;
    correctionTargetSourceId?: string | null;
  }) => {
    if (!data?.aggregationId) throw new Error("Missing aggregation id");
    if (!String(data.name ?? "").trim()) throw new Error("Source name is required");
    return { ...data, name: String(data.name).trim(), weight: Number(data.weight) || 0, displayOrder: Math.max(0, Math.trunc(Number(data.displayOrder) || 0)) };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { upsertMergedCombinedSourceServer } = await import("@/integrations/televoting/combined.server");
    const remote = await upsertMergedCombinedSourceServer(data);
    const canonicalSync = await refreshCombinedCanonicalParticipants(data.aggregationId);
    return { ...remote, canonicalSync };
  });

export const deleteMergedCombinedSource = createServerFn({ method: "POST" })
  .inputValidator((data: { aggregationId: string; sourceId: string }) => {
    if (!data?.aggregationId || !data?.sourceId) throw new Error("Missing source");
    return data;
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { deleteMergedCombinedSourceServer } = await import("@/integrations/televoting/combined.server");
    const remote = await deleteMergedCombinedSourceServer(data);
    const canonicalSync = await refreshCombinedCanonicalParticipants(data.aggregationId);
    return { ...remote, canonicalSync };
  });

export const saveMergedCombinedSourceValues = createServerFn({ method: "POST" })
  .inputValidator((data: { aggregationId: string; sourceId: string; values: Record<string, number> }) => {
    if (!data?.aggregationId || !data?.sourceId) throw new Error("Missing source");
    const values = Object.fromEntries(Object.entries(data.values ?? {}).map(([key, value]) => [key, Number(value) || 0]));
    return { aggregationId: data.aggregationId, sourceId: data.sourceId, values };
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { saveMergedCombinedSourceValuesServer } = await import("@/integrations/televoting/combined.server");
    return saveMergedCombinedSourceValuesServer(data);
  });

export const recalculateMergedCombined = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    return data;
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    // Ensure the calculator always sees the current canonical show lineup before
    // it creates a new official calculation version.
    await refreshCombinedCanonicalParticipants(data.id);
    const { recalculateMergedCombinedServer } = await import("@/integrations/televoting/combined.server");
    return recalculateMergedCombinedServer(data.id);
  });

export const setMergedCombinedStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: "draft" | "calculated" | "locked" | "published" }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    if (!["draft", "calculated", "locked", "published"].includes(data.status)) throw new Error("Invalid status");
    return data;
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    if (data.status === "locked" || data.status === "published") {
      // Refresh before the immutable transition. If the canonical lineup changed,
      // this marks the existing calculation outdated and the normal lock/publish
      // gate forces a recalculation instead of freezing stale countries.
      await refreshCombinedCanonicalParticipants(data.id);
    }

    const { setMergedCombinedStatusServer } = await import("@/integrations/televoting/combined.server");
    const remote = await setMergedCombinedStatusServer(data);

    if (data.status !== "published") return remote;

    const { trySyncPublishedCombinedResultsToSolarisServer } = await import(
      "@/integrations/televoting/results-sync.server"
    );
    const solarisSync = await trySyncPublishedCombinedResultsToSolarisServer(data.id);
    if (!solarisSync.ok) {
      throw new Error(
        `Combined Televote published, but Solaris Studio was not updated: ${solarisSync.message ?? solarisSync.status}`,
      );
    }
    return { ...remote, solarisSync };
  });

export const deleteMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    return data;
  })
  .handler(async ({ data }) => {
    await requireCombinedCapability("voting.manage");
    const { deleteMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return deleteMergedCombinedAggregationServer(data.id);
  });