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
  data_revision?: number;
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
      .select("id,name,edition_number,status,data_revision")
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
      data_revision: Number(edition.data_revision ?? 0),
    });
  }

  return projections.sort((a, b) => b.edition_number - a.edition_number);
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

  const { data: link, error: linkError } = await db
    .from("integration_links")
    .select("solaris_id")
    .eq("service", "televoting")
    .eq("entity_type", "edition")
    .eq("remote_id", round.edition_id)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link?.solaris_id) {
    throw new Error("This Televoting round is not linked to a canonical Solaris edition");
  }

  const { data: canonicalEdition, error: editionError } = await db
    .from("editions")
    .select("id,name,edition_number,status,data_revision")
    .eq("id", link.solaris_id)
    .maybeSingle();
  if (editionError) throw new Error(editionError.message);
  if (!canonicalEdition) throw new Error("The linked Solaris edition no longer exists");

  const editionNumber = Number(canonicalEdition.edition_number);
  if (!Number.isInteger(editionNumber)) throw new Error("The linked Solaris edition has no edition number");

  const edition: CanonicalTelevotingEdition = {
    id: String(round.edition_id),
    solaris_id: String(canonicalEdition.id),
    name: String(canonicalEdition.name),
    edition_number: editionNumber,
    is_active: canonicalEdition.status === "active",
    is_archived: canonicalEdition.status === "completed" || canonicalEdition.status === "finished",
    data_revision: Number(canonicalEdition.data_revision ?? 0),
  };

  const [{ data: binding, error: bindingError }, { data: shows, error: showsError }] = await Promise.all([
    db
      .from("televoting_round_bindings")
      .select("remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,last_synced_revision,frozen_at")
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

  const { data: participants, error: participantError } = await source.db
    .from("participants")
    .select("show_id")
    .eq("edition_id", source.edition.solaris_id)
    .eq("participation_status", "confirmed");
  if (participantError) throw new Error(participantError.message);

  const showCounts = new Map<string, number>();
  let editionParticipantCount = 0;
  for (const participant of participants ?? []) {
    if (!participant.show_id) {
      editionParticipantCount += 1;
      continue;
    }
    const showId = String(participant.show_id);
    showCounts.set(showId, (showCounts.get(showId) ?? 0) + 1);
  }

  return {
    round: source.round,
    edition: source.edition,
    binding: source.binding,
    edition_participant_count: editionParticipantCount,
    shows: source.shows.map((show: any) => ({
      ...show,
      participant_count: showCounts.get(String(show.id)) ?? 0,
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

  const countryUpserts = (lineup as any[]).map((row) => {
    const code = String(row.country.short_code);
    const existing = existingByCode.get(code);
    return {
      code,
      name: row.country.name,
      flag: existing?.flag ?? "✦",
      flag_url: row.country.flag_image ?? existing?.flag_url ?? null,
    };
  });

  if (countryUpserts.length) {
    const { error: countryUpsertError } = await televotingAdmin
      .from("countries")
      .upsert(countryUpserts, { onConflict: "code" });
    if (countryUpsertError) throw new Error(countryUpsertError.message);
  }

  await saveMergedRoundCountriesServer({ roundId: data.roundId, countryCodes: codes });

  const { data: remoteEntries, error: remoteEntryError } = await televotingAdmin
    .from("round_entries")
    .select("id,round_id,entry_type,entry_key,country_code,custom_name,short_name,entry_code,subtitle,image_url,description,display_order")
    .eq("round_id", data.roundId)
    .eq("entry_type", "country");
  if (remoteEntryError) throw new Error(remoteEntryError.message);

  const lineupByCode = new Map(lineup.map((row: any) => [String(row.country.short_code), row]));
  const now = new Date().toISOString();
  const subtitleUpserts = (remoteEntries ?? []).map((remoteEntry) => {
    const canonical = remoteEntry.country_code
      ? (lineupByCode.get(remoteEntry.country_code) as any)
      : null;
    const subtitle = canonical?.entry?.status === "confirmed" && canonical.entry?.artist && canonical.entry?.song_title
      ? `${canonical.entry.artist} · ${canonical.entry.song_title}`
      : "Official entry pending";
    return { ...remoteEntry, subtitle, updated_at: now };
  });

  if (subtitleUpserts.length) {
    const { error: subtitleError } = await televotingAdmin
      .from("round_entries")
      .upsert(subtitleUpserts, { onConflict: "id" });
    if (subtitleError) throw new Error(subtitleError.message);
  }

  const binding = await source.db.from("televoting_round_bindings").upsert(
    {
      remote_round_id: data.roundId,
      remote_edition_id: source.round.edition_id,
      edition_id: source.edition.solaris_id,
      show_id: showId,
      source_mode: sourceMode,
      last_synced_at: now,
      last_synced_revision: Number(source.edition.data_revision ?? 0),
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
      data_revision: Number(source.edition.data_revision ?? 0),
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
      data_revision: Number(source.edition.data_revision ?? 0),
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
