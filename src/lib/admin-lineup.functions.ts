import { createServerFn } from "@tanstack/react-start";

import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

type AddCountriesInput = {
  editionId: string;
  showId: string;
  countryIds?: string[];
};

type SyncTargetsInput = {
  editionNumber: number;
};

export type SolarisSyncTarget = {
  id: string;
  name: string;
  kind: string;
  sort_order: number;
};

export type SolarisSyncTargets = {
  editionId: string;
  editionName: string;
  editionSlug: string;
  shows: SolarisSyncTarget[];
};

export type AddCountriesToShowResult = {
  ok: true;
  showId: string;
  showName: string;
  added: number;
  refreshed: number;
  skipped: number;
  countryIds: string[];
};

function requireId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export const getSolarisEditionSyncTargets = createServerFn({ method: "POST" })
  .inputValidator((data: SyncTargetsInput) => {
    const editionNumber = Number(data?.editionNumber);
    if (!Number.isInteger(editionNumber) || editionNumber <= 0) throw new Error("Choose a valid edition");
    return { editionNumber };
  })
  .handler(async ({ data }): Promise<SolarisSyncTargets> => {
    await requireSolarisOrganizerServer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const editionResult = await db
      .from("editions")
      .select("id,name,slug,edition_number")
      .eq("edition_number", data.editionNumber)
      .maybeSingle();
    if (editionResult.error) throw new Error(editionResult.error.message);
    if (!editionResult.data) throw new Error(`SSC${data.editionNumber} does not exist in Solaris Studio.`);

    const showsResult = await db
      .from("shows")
      .select("id,name,kind,sort_order")
      .eq("edition_id", editionResult.data.id)
      .order("sort_order");
    if (showsResult.error) throw new Error(showsResult.error.message);

    return {
      editionId: editionResult.data.id,
      editionName: editionResult.data.name,
      editionSlug: editionResult.data.slug,
      shows: (showsResult.data ?? []) as SolarisSyncTarget[],
    };
  });

export const addCountriesToShow = createServerFn({ method: "POST" })
  .inputValidator((data: AddCountriesInput) => ({
    editionId: requireId(data?.editionId, "Edition"),
    showId: requireId(data?.showId, "Show"),
    countryIds: Array.isArray(data?.countryIds)
      ? [...new Set(data.countryIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))]
      : [],
  }))
  .handler(async ({ data }): Promise<AddCountriesToShowResult> => {
    await requireSolarisOrganizerServer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const showResult = await db
      .from("shows")
      .select("id,name,kind,edition_id")
      .eq("id", data.showId)
      .maybeSingle();
    if (showResult.error) throw new Error(showResult.error.message);
    const show = showResult.data;
    if (!show || show.edition_id !== data.editionId) throw new Error("That show does not belong to this edition.");

    let canonicalQuery = db
      .from("participants")
      .select(
        "id,edition_id,country_id,contest_entity_id,artist,song,notes,participation_status,youtube_url,spotify_url,apple_music_url,publication_status,scheduled_publish_at,published_at,publication_source,publication_overridden",
      )
      .eq("edition_id", data.editionId)
      .is("show_id", null)
      .eq("participation_status", "confirmed")
      .not("country_id", "is", null);

    if (data.countryIds.length) canonicalQuery = canonicalQuery.in("country_id", data.countryIds);

    const canonicalResult = await canonicalQuery.order("created_at");
    if (canonicalResult.error) throw new Error(canonicalResult.error.message);
    const canonicalRows = canonicalResult.data ?? [];

    if (!canonicalRows.length) {
      return { ok: true, showId: show.id, showName: show.name, added: 0, refreshed: 0, skipped: data.countryIds.length, countryIds: [] };
    }

    const wantedIds = canonicalRows.map((row: any) => row.country_id).filter(Boolean) as string[];
    const existingResult = await db
      .from("participants")
      .select("id,country_id,running_order")
      .eq("show_id", show.id)
      .in("country_id", wantedIds);
    if (existingResult.error) throw new Error(existingResult.error.message);

    const existingByCountry = new Map<string, any>((existingResult.data ?? []).map((row: any) => [row.country_id, row]));
    const orderResult = await db
      .from("participants")
      .select("running_order")
      .eq("show_id", show.id)
      .order("running_order", { ascending: false })
      .limit(1);
    if (orderResult.error) throw new Error(orderResult.error.message);
    let nextOrder = Math.max(0, Number(orderResult.data?.[0]?.running_order ?? 0)) + 1;

    let added = 0;
    let refreshed = 0;

    for (const source of canonicalRows as any[]) {
      const existing = existingByCountry.get(source.country_id);
      const shared = {
        country_id: source.country_id,
        contest_entity_id: source.contest_entity_id,
        artist: source.artist,
        song: source.song,
        notes: source.notes,
        participation_status: source.participation_status,
        youtube_url: source.youtube_url,
        spotify_url: source.spotify_url,
        apple_music_url: source.apple_music_url,
        publication_status: source.publication_status,
        scheduled_publish_at: source.scheduled_publish_at,
        published_at: source.published_at,
        publication_source: source.publication_source,
        publication_overridden: source.publication_overridden,
        semi_final: show.kind,
      };

      if (existing) {
        const update = await db.from("participants").update(shared).eq("id", existing.id);
        if (update.error) throw new Error(update.error.message);
        refreshed += 1;
      } else {
        const insert = await db.from("participants").insert({
          ...shared,
          edition_id: data.editionId,
          show_id: show.id,
          running_order: nextOrder,
        });
        if (insert.error) throw new Error(insert.error.message);
        nextOrder += 1;
        added += 1;
      }
    }

    const requested = data.countryIds.length ? data.countryIds.length : canonicalRows.length;
    return {
      ok: true,
      showId: show.id,
      showName: show.name,
      added,
      refreshed,
      skipped: Math.max(0, requested - canonicalRows.length),
      countryIds: wantedIds,
    };
  });
