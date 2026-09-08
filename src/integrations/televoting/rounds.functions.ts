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
  name: string;
  is_active: boolean;
  is_archived: boolean;
  rounds: MergedAdminRound[];
};

export type MergedAdminRoundsPageEdition = MergedAdminEdition & {
  solaris_id: string;
  edition_number: number;
};

export type MergedAdminRoundsPage = {
  linked: boolean;
  edition: MergedAdminRoundsPageEdition | null;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseRound(value: unknown): MergedAdminRound | null {
  const row = asRecord(value);
  const id = asNullableString(row.id);
  const editionId = asNullableString(row.edition_id);
  const name = asNullableString(row.name);
  if (!id || !editionId || !name) return null;

  const status = row.status === "open" || row.status === "closed" ? row.status : "draft";
  const count = Number(row.entry_count ?? 0);

  return {
    id,
    edition_id: editionId,
    name,
    status,
    opened_at: asNullableString(row.opened_at),
    closed_at: asNullableString(row.closed_at),
    participant_mode: typeof row.participant_mode === "string" ? row.participant_mode : "countries",
    self_voting_mode: typeof row.self_voting_mode === "string" ? row.self_voting_mode : "country_match",
    entry_count: Number.isFinite(count) ? count : 0,
  };
}

/**
 * Cheap, read-only loader for the Organizer Rounds & entries page.
 * It deliberately does not call the legacy catalog synchronizer.
 */
export const getMergedTelevotingRoundsPage = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string }) => {
    const editionId = String(data?.editionId ?? "").trim();
    if (!editionId) throw new Error("Missing Solaris edition");
    return { editionId };
  })
  .handler(async ({ data }) => {
    const [{ requireMergedTelevotingAdminServer }, { televotingAdmin }] = await Promise.all([
      import("@/integrations/televoting/admin-session.server"),
      import("@/integrations/televoting/client.server"),
    ]);

    await requireMergedTelevotingAdminServer();

    const { data: rawPayload, error } = await televotingAdmin.rpc(
      "admin_rounds_page_overview",
      { p_solaris_edition_id: data.editionId },
    );
    if (error) throw new Error(error.message);

    const payload = asRecord(rawPayload);
    const editionRow = asRecord(payload.edition);
    const remoteId = asNullableString(editionRow.id);
    const solarisId = asNullableString(editionRow.solaris_id);
    const name = asNullableString(editionRow.name);
    const editionNumber = Number(editionRow.edition_number);
    const rawRounds = Array.isArray(payload.rounds) ? payload.rounds : [];
    const rounds = rawRounds.map(parseRound).filter((round): round is MergedAdminRound => Boolean(round));

    const edition =
      remoteId && solarisId && name && Number.isFinite(editionNumber)
        ? {
            id: remoteId,
            solaris_id: solarisId,
            name,
            edition_number: editionNumber,
            is_active: editionRow.is_active === true,
            is_archived: editionRow.is_archived === true,
            rounds,
          }
        : null;

    return {
      linked: payload.linked === true,
      edition,
    } satisfies MergedAdminRoundsPage;
  });

export const getMergedTelevotingRounds = createServerFn({ method: "GET" }).handler(async () => {
  const { getMergedTelevotingRoundsServer } = await import(
    "@/integrations/televoting/rounds.server"
  );
  return getMergedTelevotingRoundsServer() as Promise<MergedAdminEdition[]>;
});

export const createMergedTelevotingRound = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!data?.editionId) throw new Error("Missing edition");
    if (!name) throw new Error("Round name required");
    return { editionId: data.editionId, name };
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
