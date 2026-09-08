import { createServerFn } from "@tanstack/react-start";

export type MergedAdminRound = {
  id: string;
  edition_id: string;
  name: string;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  participant_mode: string;
  self_voting_mode: string;
  entry_count: number;
};

export type MergedAdminEdition = {
  id: string;
  solaris_id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  rounds: MergedAdminRound[];
};

export const getMergedTelevotingRounds = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string }) => {
    const editionId = String(data?.editionId ?? "").trim();
    if (!editionId) throw new Error("Missing Solaris edition");
    return { editionId };
  })
  .handler(async ({ data }) => {
    const { getMergedTelevotingRoundsServer } = await import(
      "@/integrations/televoting/rounds.server"
    );
    return getMergedTelevotingRoundsServer(data.editionId) as Promise<MergedAdminEdition>;
  });

export const createMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { solarisEditionId: string; name: string }) => {
    const solarisEditionId = String(data?.solarisEditionId ?? "").trim();
    const name = String(data?.name ?? "").trim();
    if (!solarisEditionId) throw new Error("Missing Solaris edition");
    if (!name) throw new Error("Round name required");
    return { solarisEditionId, name };
  })
  .handler(async ({ data }) => {
    const { createMergedTelevotingRoundServer } = await import(
      "@/integrations/televoting/rounds.server"
    );
    return createMergedTelevotingRoundServer(data);
  });

export const renameMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!data?.id) throw new Error("Missing round");
    if (!name) throw new Error("Round name required");
    return { id: data.id, name };
  })
  .handler(async ({ data }) => {
    const { renameMergedTelevotingRoundServer } = await import(
      "@/integrations/televoting/rounds.server"
    );
    return renameMergedTelevotingRoundServer(data);
  });

export const setMergedTelevotingRoundStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: "draft" | "open" | "closed" }) => {
    if (!data?.id) throw new Error("Missing round");
    if (!["draft", "open", "closed"].includes(data.status)) throw new Error("Invalid status");
    return data;
  })
  .handler(async ({ data }) => {
    const { setMergedTelevotingRoundStatusServer } = await import(
      "@/integrations/televoting/rounds.server"
    );
    return setMergedTelevotingRoundStatusServer(data);
  });

export const deleteMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing round");
    return data;
  })
  .handler(async ({ data }) => {
    const { deleteMergedTelevotingRoundServer } = await import(
      "@/integrations/televoting/rounds.server"
    );
    return deleteMergedTelevotingRoundServer(data);
  });
