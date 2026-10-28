import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function editionNumberFromName(value: unknown) {
  const matches = String(value ?? "").match(/(\d+)(?!.*\d)/);
  return matches ? Number(matches[1]) : null;
}

export type CanonicalTelevotingEdition = {
  id: string;
  solaris_id: string;
  name: string;
  edition_number: number;
  is_active: boolean;
  is_archived: boolean;
};

async function solarisDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * Explicit catalog reconciliation. This remains a deliberate mutation action;
 * ordinary Televote reads below never invoke it implicitly.
 */
export async function ensureCanonicalTelevotingEditionsServer(): Promise<CanonicalTelevotingEdition[]> {
  await requireMergedTelevotingAdminServer();
  const db = await solarisDb();

  const [solarisResult, remoteResult, linkResult] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number,status")
      .not("edition_number", "is", null)
      .order("edition_number"),
    televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived,created_at")
      .order("created_at"),
    db
      .from("integration_links")
      .select("solaris_id,remote_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition"),
  ]);

  if (solarisResult.error) throw new Error(solarisResult.error.message);
  if (remoteResult.error) throw new Error(remoteResult.error.message);
  if (linkResult.error) throw new Error(linkResult.error.message);

  const remoteEditions = [...(remoteResult.data ?? [])];
  const links = new Map<string, string>(
    (linkResult.data ?? []).map((row: any) => [String(row.solaris_id), String(row.remote_id)]),
  );
  const claimedRemoteIds = new Set<string>();

  const { error: deactivateError } = await televotingAdmin
    .from("editions")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) throw new Error(deactivateError.message);

  const projections: CanonicalTelevotingEdition[] = [];

  for (const edition of solarisResult.data ?? []) {
    const editionNumber = Number(edition.edition_number);
    if (!Number.isInteger(editionNumber)) continue;

    const linkedRemoteId = links.get(String(edition.id));
    let remote = linkedRemoteId
      ? remoteEditions.find((candidate) => candidate.id === linkedRemoteId)
      : undefined;

    if (!remote) {
      remote = remoteEditions.find(
        (candidate) =>
          !claimedRemoteIds.has(candidate.id) &&
          normalize(candidate.name) === normalize(edition.name),
      );
    }

    if (!remote) {
      remote = remoteEditions.find(
        (candidate) =>
          !claimedRemoteIds.has(candidate.id) &&
          editionNumberFromName(candidate.name) === editionNumber,
      );
    }

    const isActive = edition.status === "active";
    const isArchived = edition.status === "completed" || edition.status === "finished";

    if (!remote) {
      const created = await televotingAdmin
        .from("editions")
        .insert({
          name: edition.name,
          is_active: false,
          is_archived: isArchived,
        })
        .select("id,name,is_active,is_archived,created_at")
        .single();
      if (created.error) throw new Error(created.error.message);
      remote = created.data;
      remoteEditions.push(remote);
    }

    claimedRemoteIds.add(remote.id);

    const update = await televotingAdmin
      .from("editions")
      .update({
        name: edition.name,
        is_active: isActive,
        is_archived: isArchived,
      })
      .eq("id", remote.id);
    if (update.error) throw new Error(update.error.message);

    await db
      .from("integration_links")
      .delete()
      .eq("service", "televoting")
      .eq("entity_type", "edition")
      .eq("solaris_id", edition.id)
      .neq("remote_id", remote.id);
    await db
      .from("integration_links")
      .delete()
      .eq("service", "televoting")
      .eq("entity_type", "edition")
      .eq("remote_id", remote.id)
      .neq("solaris_id", edition.id);

    const now = new Date().toISOString();
    const link = await db.from("integration_links").upsert(
      {
        service: "televoting",
        entity_type: "edition",
        solaris_id: edition.id,
        remote_id: remote.id,
        edition_id: edition.id,
        sync_status: "linked",
        metadata: { edition_number: editionNumber },
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "service,entity_type,remote_id" },
    );
    if (link.error) throw new Error(link.error.message);

    projections.push({
      id: remote.id,
      solaris_id: edition.id,
      name: String(edition.name),
      edition_number: editionNumber,
      is_active: isActive,
      is_archived: isArchived,
    });
  }

  return projections.sort((a, b) => b.edition_number - a.edition_number);
}

async function readCanonicalTelevotingEditionsServer(): Promise<CanonicalTelevotingEdition[]> {
  const db = await solarisDb();
  const [solarisResult, remoteResult, linkResult] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number,status")
      .not("edition_number", "is", null),
    televotingAdmin
      .from("editions")
      .select("id,name,is_active,is_archived"),
    db
      .from("integration_links")
      .select("solaris_id,remote_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition"),
  ]);
  if (solarisResult.error) throw new Error(solarisResult.error.message);
  if (remoteResult.error) throw new Error(remoteResult.error.message);
  if (linkResult.error) throw new Error(linkResult.error.message);

  const solarisById = new Map((solarisResult.data ?? []).map((edition: any) => [String(edition.id), edition]));
  const remoteById = new Map((remoteResult.data ?? []).map((edition: any) => [String(edition.id), edition]));

  return (linkResult.data ?? []).flatMap((link: any) => {
    const solaris = solarisById.get(String(link.solaris_id)) as any;
    const remote = remoteById.get(String(link.remote_id)) as any;
    if (!solaris || !remote) return [];
    const editionNumber = Number(solaris.edition_number);
    if (!Number.isInteger(editionNumber)) return [];
    return [{
      id: String(remote.id),
      solaris_id: String(solaris.id),
      name: String(solaris.name),
      edition_number: editionNumber,
      is_active: remote.is_active === true,
      is_archived: remote.is_archived === true,
    }];
  }).sort((a: CanonicalTelevotingEdition, b: CanonicalTelevotingEdition) => b.edition_number - a.edition_number);
}

async function resolveRoundSource(roundId: string) {
  const db = await solarisDb();
  const { data: round, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,name,status,edition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new Error("Round not found");

  const editions = await readCanonicalTelevotingEditionsServer();
  const edition = editions.find((candidate) => candidate.id === round.edition_id);
  if (!edition) throw new Error("This Televoting round is not linked to a canonical Solaris edition");

  const [{ data: binding, error: bindingError }, { data: shows, error: showsError }] = await Promise.all([
    db
      .from("televoting_round_bindings")
      .select("remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,frozen_at")
      .eq("remote_round_id", roundId)
      .maybeSingle(),
    db
      .from("shows")
      .select("id,name,kind,status,sort_order")
      .eq("edition_id", edition.solaris_id)
      .order("sort_order"),
  ]);
  if (bindingError) throw new Error(bindingError.message);
  if (showsError) throw new Error(showsError.message);

  return { db, round, edition, binding, shows: shows ?? [] };
}

export async function getMergedRoundSolarisSourceServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const source = await resolveRoundSource(roundId);

  const { count: editionParticipantCount, error: countError } = await source.db
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", source.edition.solaris_id)
    .is("show_id", null)
    .eq("participation_status", "confirmed");
  if (countError) throw new Error(countError.message);

  const showCounts = [] as Array<{ show_id: string; count: number }>;
  for (const show of source.shows) {
    const { count, error } = await source.db
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", source.edition.solaris_id)
      .eq("show_id", show.id)
      .eq("participation_status", "confirmed");
    if (error) throw new Error(error.message);
    showCounts.push({ show_id: show.id, count: count ?? 0 });
  }

  return {
    round: source.round,
    edition: source.edition,
    binding: source.binding,
    edition_participant_count: editionParticipantCount ?? 0,
    shows: source.shows.map((show: any) => ({
      ...show,
      participant_count: showCounts.find((row) => row.show_id === show.id)?.count ?? 0,
    })),
  };
}

export async function syncMergedRoundFromSolarisServer(data: {
  roundId: string;
  showId?: string | null;
  sourceMode?: "edition" | "show";
  expectedRoundVersion?: number;
  operationId?: string;
  idempotencyKey?: string;
}) {
  await requireMergedTelevotingAdminServer();

  // Explicit sync may repair/create edition projection links. Ordinary source
  // reads above are pure and never invoke this mutation path.
  await ensureCanonicalTelevotingEditionsServer();
  const source = await resolveRoundSource(data.roundId);

  if (source.round.status === "open") {
    throw new Error("Close the voting round before syncing its Solaris line-up");
  }

  const sourceMode = data.sourceMode ?? source.binding?.source_mode ?? "edition";
  const showId = sourceMode === "show"
    ? (data.showId ?? source.binding?.show_id ?? null)
    : null;

  if (sourceMode === "show") {
    if (!showId) throw new Error("Choose a Solaris show before syncing this round");
    const validShow = source.shows.find((show: any) => show.id === showId);
    if (!validShow) throw new Error("The selected show does not belong to this edition");
  }

  let participantsQuery = source.db
    .from("participants")
    .select("id,country_id,running_order,created_at")
    .eq("edition_id", source.edition.solaris_id)
    .eq("participation_status", "confirmed");
  participantsQuery = sourceMode === "show"
    ? participantsQuery.eq("show_id", showId)
    : participantsQuery.is("show_id", null);

  const { data: participants, error: participantError } = await participantsQuery;
  if (participantError) throw new Error(participantError.message);

  const countryIds = [...new Set((participants ?? []).map((row: any) => row.country_id).filter(Boolean))];
  if (countryIds.length < 2) throw new Error("The selected Solaris source has fewer than two confirmed participants");
  if (countryIds.length > 50) throw new Error("Televoting supports at most 50 entries per round");

  const [countriesResult, entriesResult] = await Promise.all([
    source.db.from("countries").select("id,name,short_code,flag_image").in("id", countryIds),
    source.db
      .from("entries")
      .select("id,country_id,artist,song_title,status")
      .eq("edition_id", source.edition.solaris_id)
      .in("country_id", countryIds),
  ]);
  if (countriesResult.error) throw new Error(countriesResult.error.message);
  if (entriesResult.error) throw new Error(entriesResult.error.message);

  const countryById = new Map((countriesResult.data ?? []).map((row: any) => [row.id, row]));
  const entryByCountry = new Map((entriesResult.data ?? []).map((row: any) => [row.country_id, row]));
  const lineup = (participants ?? [])
    .map((participant: any) => {
      const country = countryById.get(participant.country_id) as any;
      if (!country) return null;
      return { participant, country, entry: entryByCountry.get(participant.country_id) as any };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const aOrder = Number(a.participant.running_order ?? Number.MAX_SAFE_INTEGER);
      const bOrder = Number(b.participant.running_order ?? Number.MAX_SAFE_INTEGER);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.country.name).localeCompare(String(b.country.name));
    });

  const countryPayload = lineup.map((row: any) => ({
    code: String(row.country.short_code),
    name: String(row.country.name),
    flagUrl: row.country.flag_image ?? null,
    subtitle: row.entry?.status === "confirmed" && row.entry?.artist && row.entry?.song_title
      ? `${row.entry.artist} · ${row.entry.song_title}`
      : "Official entry pending",
  }));
  const codes = countryPayload.map((row: { code: string }) => row.code);
  if (new Set(codes).size !== codes.length) {
    throw new Error("Solaris contains duplicate country short codes in this line-up");
  }

  let expectedRoundVersion = data.expectedRoundVersion;
  if (expectedRoundVersion === undefined) {
    const { data: snapshot, error: snapshotError } = await televotingAdmin.rpc("v3_round_config_snapshot", {
      p_round_id: data.roundId,
    });
    if (snapshotError) throw new Error(snapshotError.message);
    expectedRoundVersion = Number((snapshot as any)?.version ?? -1);
  }
  if (!Number.isInteger(expectedRoundVersion) || expectedRoundVersion < 0) {
    throw new Error("Canonical round revision is unavailable; refresh before syncing");
  }

  const operationId = data.operationId || crypto.randomUUID();
  const idempotencyKey = data.idempotencyKey || crypto.randomUUID();
  const { data: receipt, error: syncError } = await televotingAdmin.rpc("v3_sync_round_lineup", {
    p_round_id: data.roundId,
    p_source_mode: sourceMode,
    p_show_id: showId,
    p_countries: countryPayload,
    p_expected_round_version: expectedRoundVersion,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: operationId,
  });
  if (syncError) throw new Error(syncError.message);

  return {
    ok: true,
    edition: source.edition,
    source_mode: sourceMode,
    show_id: showId,
    participant_count: lineup.length,
    confirmed_entry_count: lineup.filter((row: any) => row.entry?.status === "confirmed").length,
    pending_entry_count: lineup.filter((row: any) => row.entry?.status !== "confirmed").length,
    round_version: Number((receipt as any)?.roundVersion ?? expectedRoundVersion),
    operation_id: String((receipt as any)?.operationId ?? operationId),
  };
}
