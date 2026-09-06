import { createServerFn } from "@tanstack/react-start";

const finiteBetween = (value: unknown, min: number, max: number, name: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return number;
};

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
    engineVersion?: "rank-weighted-v1" | "robust-televote-v2";
    ballotExponent?: number;
    breadthFloor?: number;
    breadthExponent?: number;
    supportExponent?: number;
    rankBoostStrength?: number;
    rankBoostShape?: number;
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
    if (data.rankExponent !== undefined) output.rankExponent = finiteBetween(data.rankExponent, 0.01, 5, "Rank exponent");
    if (data.engineVersion !== undefined) {
      if (!["rank-weighted-v1", "robust-televote-v2"].includes(data.engineVersion)) throw new Error("Invalid calculation engine");
      output.engineVersion = data.engineVersion;
    }
    if (data.ballotExponent !== undefined) output.ballotExponent = finiteBetween(data.ballotExponent, 0.1, 2, "Ballot exponent");
    if (data.breadthFloor !== undefined) output.breadthFloor = finiteBetween(data.breadthFloor, 0, 1, "Breadth floor");
    if (data.breadthExponent !== undefined) output.breadthExponent = finiteBetween(data.breadthExponent, 0.1, 2, "Breadth exponent");
    if (data.supportExponent !== undefined) output.supportExponent = finiteBetween(data.supportExponent, 0.1, 3, "Support exponent");
    if (data.rankBoostStrength !== undefined) output.rankBoostStrength = finiteBetween(data.rankBoostStrength, 0, 3, "Rank boost strength");
    if (data.rankBoostShape !== undefined) output.rankBoostShape = finiteBetween(data.rankBoostShape, 0.1, 4, "Rank boost shape");
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
    const { loadMergedConversionRound, runMergedOfficialCalculationServer } = await import("@/integrations/televoting/conversion.server");
    const round = await loadMergedConversionRound(data.roundId);
    if (round.results_status === "locked" && !data.confirm) throw new Error("This result is locked — explicit confirmation required");
    if (round.results_status === "published" && !data.confirm) throw new Error("This result is published — explicit confirmation required");
    return runMergedOfficialCalculationServer(data.roundId);
  });

export const checkMergedPublicationReadiness = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { requireMergedTelevotingAdminServer } = await import("@/integrations/televoting/admin-session.server");
    const { validateMergedPublicationServer } = await import("@/integrations/televoting/conversion.server");
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
    const { setMergedResultsStatusServer } = await import("@/integrations/televoting/conversion.server");
    const remote = await setMergedResultsStatusServer(data);
    if (data.status !== "published") return remote;
    const { trySyncPublishedRoundResultsToSolarisServer } = await import("@/integrations/televoting/results-sync.server");
    const solarisSync = await trySyncPublishedRoundResultsToSolarisServer(data.roundId);
    if (!solarisSync.ok && solarisSync.status !== "waiting_for_combined") {
      throw new Error(`Televote published, but Solaris Studio was not updated: ${solarisSync.message ?? solarisSync.status}`);
    }
    return { ...remote, solarisSync };
  });
