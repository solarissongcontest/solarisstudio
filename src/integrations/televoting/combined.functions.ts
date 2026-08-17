import { createServerFn } from "@tanstack/react-start";
import type { CorrectionScope, SourceInputMode } from "@/integrations/televoting/combined-math";

export const listMergedCombinedAggregations = createServerFn({ method: "GET" }).handler(async () => {
  const { listMergedCombinedAggregationsServer } = await import("@/integrations/televoting/combined.server");
  return listMergedCombinedAggregationsServer();
});

export const getMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    return data;
  })
  .handler(async ({ data }) => {
    const { getMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return getMergedCombinedAggregationServer(data.id);
  });

export const createMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; editionId?: string | null; totalPoints: number; rankExponent: number }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Name is required");
    const totalPoints = Math.max(1, Math.trunc(Number(data.totalPoints)));
    const rankExponent = Number(data.rankExponent);
    if (!Number.isFinite(rankExponent) || rankExponent <= 0) throw new Error("Invalid rank exponent");
    return { name, editionId: data.editionId ?? null, totalPoints, rankExponent };
  })
  .handler(async ({ data }) => {
    const { createMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return createMergedCombinedAggregationServer(data);
  });

export const updateMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string; totalPoints: number; rankExponent: number }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Name is required");
    return { id: data.id, name, totalPoints: Math.max(1, Math.trunc(Number(data.totalPoints))), rankExponent: Number(data.rankExponent) };
  })
  .handler(async ({ data }) => {
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
    const { upsertMergedCombinedSourceServer } = await import("@/integrations/televoting/combined.server");
    return upsertMergedCombinedSourceServer(data);
  });

export const deleteMergedCombinedSource = createServerFn({ method: "POST" })
  .inputValidator((data: { aggregationId: string; sourceId: string }) => {
    if (!data?.aggregationId || !data?.sourceId) throw new Error("Missing source");
    return data;
  })
  .handler(async ({ data }) => {
    const { deleteMergedCombinedSourceServer } = await import("@/integrations/televoting/combined.server");
    return deleteMergedCombinedSourceServer(data);
  });

export const saveMergedCombinedSourceValues = createServerFn({ method: "POST" })
  .inputValidator((data: { aggregationId: string; sourceId: string; values: Record<string, number> }) => {
    if (!data?.aggregationId || !data?.sourceId) throw new Error("Missing source");
    const values = Object.fromEntries(Object.entries(data.values ?? {}).map(([key, value]) => [key, Number(value) || 0]));
    return { aggregationId: data.aggregationId, sourceId: data.sourceId, values };
  })
  .handler(async ({ data }) => {
    const { saveMergedCombinedSourceValuesServer } = await import("@/integrations/televoting/combined.server");
    return saveMergedCombinedSourceValuesServer(data);
  });

export const recalculateMergedCombined = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    return data;
  })
  .handler(async ({ data }) => {
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
    const { setMergedCombinedStatusServer } = await import("@/integrations/televoting/combined.server");
    const remote = await setMergedCombinedStatusServer(data);

    if (data.status !== "published") return remote;

    const { trySyncPublishedCombinedResultsToSolarisServer } = await import(
      "@/integrations/televoting/results-sync.server"
    );
    const solarisSync = await trySyncPublishedCombinedResultsToSolarisServer(data.id);
    return { ...remote, solarisSync };
  });

export const deleteMergedCombinedAggregation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing aggregation id");
    return data;
  })
  .handler(async ({ data }) => {
    const { deleteMergedCombinedAggregationServer } = await import("@/integrations/televoting/combined.server");
    return deleteMergedCombinedAggregationServer(data.id);
  });