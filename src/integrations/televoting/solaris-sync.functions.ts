import { createServerFn } from "@tanstack/react-start";

export type MergedRoundSolarisSource = {
  round: {
    id: string;
    name: string;
    status: string;
    edition_id: string;
  };
  edition: {
    id: string;
    solaris_id: string;
    name: string;
    edition_number: number;
    is_active: boolean;
    is_archived: boolean;
  };
  binding: {
    remote_round_id: string;
    remote_edition_id: string;
    edition_id: string;
    show_id: string | null;
    source_mode: "edition" | "show";
    last_synced_at: string | null;
    frozen_at: string | null;
  } | null;
  edition_participant_count: number;
  shows: Array<{
    id: string;
    name: string;
    kind: string;
    status: string;
    sort_order: number;
    participant_count: number;
  }>;
};

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
    return (await getMergedRoundSolarisSourceServer(data.roundId)) as MergedRoundSolarisSource;
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
