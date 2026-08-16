import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevoteConversion = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { getMergedTelevoteConversionServer } = await import(
      "@/integrations/televoting/conversion.server"
    );
    return getMergedTelevoteConversionServer(data.roundId);
  });

export const updateMergedConversionConfig = createServerFn({ method: "POST" })
  .inputValidator((data: {
    roundId: string;
    totalPoints?: number;
    rankExponent?: number;
    advancedTransparency?: boolean;
    broadcastMode?: "original" | "converted" | "combined";
  }) => {
    if (!data?.roundId) throw new Error("Missing round");
    const output: typeof data = { roundId: data.roundId };
    if (data.totalPoints !== undefined) {
      const value = Number(data.totalPoints);
      if (!Number.isInteger(value) || value < 0) throw new Error("T must be a non-negative whole number");
      output.totalPoints = value;
    }
    if (data.rankExponent !== undefined) {
      const value = Number(data.rankExponent);
      if (!Number.isFinite(value) || value <= 0 || value > 5) throw new Error("Rank exponent must be between 0 and 5");
      output.rankExponent = value;
    }
    if (data.advancedTransparency !== undefined) output.advancedTransparency = Boolean(data.advancedTransparency);
    if (data.broadcastMode !== undefined) {
      if (!["original", "converted", "combined"].includes(data.broadcastMode)) throw new Error("Invalid broadcast mode");
      output.broadcastMode = data.broadcastMode;
    }
    return output;
  })
  .handler(async ({ data }) => {
    const { updateMergedConversionConfigServer } = await import(
      "@/integrations/televoting/conversion.server"
    );
    return updateMergedConversionConfigServer(data);
  });

export const recalculateMergedConversion = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string; confirm?: boolean }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return { roundId: data.roundId, confirm: Boolean(data.confirm) };
  })
  .handler(async ({ data }) => {
    const {
      loadMergedConversionRound,
      runMergedOfficialCalculationServer,
    } = await import("@/integrations/televoting/conversion.server");

    const round = await loadMergedConversionRound(data.roundId);
    if (round.results_status === "locked" && !data.confirm) {
      throw new Error("This result is locked — explicit confirmation required");
    }
    if (round.results_status === "published" && !data.confirm) {
      throw new Error("This result is published — explicit confirmation required");
    }
    return runMergedOfficialCalculationServer(data.roundId);
  });

export const checkMergedPublicationReadiness = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { requireMergedTelevotingAdminServer } = await import(
      "@/integrations/televoting/admin-session.server"
    );
    const { validateMergedPublicationServer } = await import(
      "@/integrations/televoting/conversion.server"
    );
    await requireMergedTelevotingAdminServer();
    const { problems } = await validateMergedPublicationServer(data.roundId);
    return { problems };
  });

export const setMergedResultsStatus = createServerFn({ method: "POST" })
  .inputValidator((data: {
    roundId: string;
    status: "calculated" | "locked" | "published";
    reason?: string;
  }) => {
    if (!data?.roundId) throw new Error("Missing round");
    if (!["calculated", "locked", "published"].includes(data.status)) throw new Error("Invalid status");
    return {
      roundId: data.roundId,
      status: data.status,
      reason: data.reason?.trim() || undefined,
    };
  })
  .handler(async ({ data }) => {
    const { setMergedResultsStatusServer } = await import(
      "@/integrations/televoting/conversion.server"
    );
    return setMergedResultsStatusServer(data);
  });
