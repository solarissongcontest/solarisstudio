import { createServerFn } from "@tanstack/react-start";

export const syncMergedTelevotingEditionCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureCanonicalTelevotingEditionsServer } = await import(
    "@/integrations/televoting/solaris-sync.server"
  );
  return ensureCanonicalTelevotingEditionsServer();
});

export const getMergedRoundSolarisSource = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId: string }) => {
    if (!data?.roundId) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { getMergedRoundSolarisSourceServer } = await import(
      "@/integrations/televoting/solaris-sync.server"
    );
    return getMergedRoundSolarisSourceServer(data.roundId);
  });

export const syncMergedRoundFromSolaris = createServerFn({ method: "POST" })
  .inputValidator((data: {
    roundId: string;
    sourceMode?: "edition" | "show";
    showId?: string | null;
  }) => {
    if (!data?.roundId) throw new Error("Missing round");
    if (data.sourceMode && !["edition", "show"].includes(data.sourceMode)) {
      throw new Error("Invalid Solaris line-up source");
    }
    return {
      roundId: data.roundId,
      sourceMode: data.sourceMode,
      showId: data.showId ?? null,
    };
  })
  .handler(async ({ data }) => {
    const { syncMergedRoundFromSolarisServer } = await import(
      "@/integrations/televoting/solaris-sync.server"
    );
    return syncMergedRoundFromSolarisServer(data);
  });
