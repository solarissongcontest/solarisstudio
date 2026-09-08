import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { saveMergedRoundCountriesServer } from "@/integrations/televoting/entries.server";

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

  // Canonical Solaris status owns which Televoting projection is active.
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

    const link = await db.from("integration_links").upsert(
      {
        service: "televoting",
        entity_type: "edition",
        solaris_id: edition.id,
        remote_id: remote.id,
        edition_id: edition.id,
        sync_status: "linked",
        metadata: { edition_number: editionNumber },
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

async function resolveRoundSource(roundId: string) {
  const db = await solarisDb();
  const editions = await ensureCanonicalTelevotingEditionsServer();

  const { data: round, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,name,status,edition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new Error("Round not found");

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
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const source = await resolveRoundSource(data.roundId);

  if (source.round.status === "open") {
    throw new Error("Close the voting round before syncing its Solaris line-up");
  }

  const explicitMode = data.sourceMode;
  const sourceMode = explicitMode ?? source.binding?.source_mode ?? "edition";
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
  if (countryIds.length < 2) {
    throw new Error("The selected Solaris source has fewer than two confirmed participants");
  }
  if (countryIds.length > 50) throw new Error("Televoting supports at most 50 entries per round");

  const [countriesResult, entriesResult] = await Promise.all([
    source.db
      .from("countries")
      .select("id,name,short_code,flag_image")
      .in("id", countryIds),
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
      const entry = entryByCountry.get(participant.country_id) as any;
      return {
        participant,
        country,
        entry,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const aOrder = Number(a.participant.running_order ?? Number.MAX_SAFE_INTEGER);
      const bOrder = Number(b.participant.running_order ?? Number.MAX_SAFE_INTEGER);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.country.name).localeCompare(String(b.country.name));
    });

  const codes = lineup.map((row: any) => String(row.country.short_code));
  if (new Set(codes).size !== codes.length) throw new Error("Solaris contains duplicate country short codes in this line-up");

  const { data: existingCountries, error: existingCountryError } = await televotingAdmin
    .from("countries")
    .select("code,name,flag,flag_url")
    .in("code", codes);
  if (existingCountryError) throw new Error(existingCountryError.message);
  const existingByCode = new Map((existingCountries ?? []).map((row) => [row.code, row]));

  for (const row of lineup as any[]) {
    const code = String(row.country.short_code);
    const existing = existingByCode.get(code);
    if (existing) {
      const { error } = await televotingAdmin
        .from("countries")
        .update({ name: row.country.name, flag_url: row.country.flag_image ?? existing.flag_url })
        .eq("code", code);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await televotingAdmin.from("countries").insert({
        code,
        name: row.country.name,
        flag: "✦",
        flag_url: row.country.flag_image ?? null,
      });
      if (error) throw new Error(error.message);
    }
  }

  await saveMergedRoundCountriesServer({ roundId: data.roundId, countryCodes: codes });

  const { data: remoteEntries, error: remoteEntryError } = await televotingAdmin
    .from("round_entries")
    .select("id,country_code")
    .eq("round_id", data.roundId)
    .eq("entry_type", "country");
  if (remoteEntryError) throw new Error(remoteEntryError.message);

  const lineupByCode = new Map(lineup.map((row: any) => [String(row.country.short_code), row]));
  for (const remoteEntry of remoteEntries ?? []) {
    if (!remoteEntry.country_code) continue;
    const canonical = lineupByCode.get(remoteEntry.country_code) as any;
    if (!canonical) continue;
    const subtitle = canonical.entry?.status === "confirmed" && canonical.entry?.artist && canonical.entry?.song_title
      ? `${canonical.entry.artist} · ${canonical.entry.song_title}`
      : "Official entry pending";
    const { error } = await televotingAdmin
      .from("round_entries")
      .update({ subtitle })
      .eq("id", remoteEntry.id);
    if (error) throw new Error(error.message);
  }

  const now = new Date().toISOString();
  const binding = await source.db.from("televoting_round_bindings").upsert(
    {
      remote_round_id: data.roundId,
      remote_edition_id: source.round.edition_id,
      edition_id: source.edition.solaris_id,
      show_id: showId,
      source_mode: sourceMode,
      last_synced_at: now,
      frozen_at: null,
      updated_at: now,
    },
    { onConflict: "remote_round_id" },
  );
  if (binding.error) throw new Error(binding.error.message);

  await source.db.from("integration_events").insert({
    service: "televoting",
    event_type: "round.lineup.synced",
    entity_type: "round",
    remote_id: data.roundId,
    payload: {
      solaris_edition_id: source.edition.solaris_id,
      show_id: showId,
      source_mode: sourceMode,
      countries: codes,
    },
    status: "completed",
    attempts: 1,
    completed_at: now,
  });

  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action: "sync_round_from_solaris",
    target_type: "round",
    target_id: data.roundId,
    new_values: {
      solaris_edition_id: source.edition.solaris_id,
      show_id: showId,
      source_mode: sourceMode,
      country_codes: codes,
    },
  });

  return {
    ok: true,
    edition: source.edition,
    source_mode: sourceMode,
    show_id: showId,
    participant_count: lineup.length,
    confirmed_entry_count: lineup.filter((row: any) => row.entry?.status === "confirmed").length,
    pending_entry_count: lineup.filter((row: any) => row.entry?.status !== "confirmed").length,
  };
}
