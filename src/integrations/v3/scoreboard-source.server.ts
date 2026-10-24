import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { loadV3PublishedResultSnapshot } from "@/integrations/v3/public-result-snapshot.server";
import type { Standing } from "@/lib/analysis";
import type { Country } from "@/lib/data";
import {
  entityDisplayMap,
  type ContestEntityRow,
} from "@/lib/entities";

const ENTITY_COLUMNS =
  "id,edition_id,entity_type,country_id,display_name,abbreviation,flag_image,region,historical_identity_override";
const COUNTRY_COLUMNS =
  "id,name,native_name,short_code,flag_image,region,accent_color,description,first_participation";

type ScoreboardSourceClient = {
  from(table: string): any;
};

export type V3ScoreboardCountry = Country & {
  entityType: "global" | "custom";
};

export type V3ScoreboardServerBundle = {
  showId: string;
  editionId: string | null;
  publication: "hidden" | "published";
  juryPublished: boolean;
  televotePublished: boolean;
  standings: Standing[];
  countries: V3ScoreboardCountry[];
  generatedAt: string;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function hiddenBundle(showId: string): V3ScoreboardServerBundle {
  return {
    showId,
    editionId: null,
    publication: "hidden",
    juryPublished: false,
    televotePublished: false,
    standings: [],
    countries: [],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Exact published-result source for the installed-app Scoreboard.
 *
 * The browser supplies only a Show id. Official rank, total score and any public
 * split score come from the immutable Result Version selected by canonical
 * Publication through `loadV3PublishedResultSnapshot`. Missing publication
 * provenance fails closed. Identity reads are edition-scoped and the adapter has
 * deliberately no mutable `public.results` fallback.
 */
export async function loadV3ScoreboardBundle(
  showId: string,
): Promise<V3ScoreboardServerBundle> {
  const snapshot = await loadV3PublishedResultSnapshot(showId);
  if (!snapshot) return hiddenBundle(showId);

  const client = createConfirmationPublicRuntimeClient() as unknown as ScoreboardSourceClient;
  const entitiesResult = await client
    .from("contest_entities")
    .select(ENTITY_COLUMNS)
    .eq("edition_id", snapshot.edition.id);
  throwIfError(entitiesResult.error, "Could not load published Scoreboard identities");

  const entities = (entitiesResult.data ?? []) as ContestEntityRow[];
  const countryIds = new Set<string>();
  for (const entity of entities) {
    if (entity.country_id) countryIds.add(entity.country_id);
  }
  for (const row of snapshot.rows) {
    if (row.countryId) countryIds.add(row.countryId);
  }

  let countries: Country[] = [];
  if (countryIds.size) {
    const countriesResult = await client
      .from("countries")
      .select(COUNTRY_COLUMNS)
      .in("id", [...countryIds]);
    throwIfError(countriesResult.error, "Could not load published Scoreboard countries");
    countries = (countriesResult.data ?? []) as Country[];
  }

  const displayMap = entityDisplayMap(entities, countries);
  const projectedCountries = new Map<string, V3ScoreboardCountry>();
  const standings = snapshot.rows.map<Standing>((row) => {
    const identityId = row.contestEntityId ?? row.countryId ?? "";
    const display = displayMap.get(identityId);
    if (!display) {
      throw new Error("Published Scoreboard identity could not be resolved");
    }
    if (snapshot.availability.jury && row.juryPoints == null) {
      throw new Error("Published Scoreboard Jury split is incomplete");
    }
    if (snapshot.availability.televote && row.televotePoints == null) {
      throw new Error("Published Scoreboard Televote split is incomplete");
    }

    projectedCountries.set(display.id, {
      id: display.id,
      name: display.name,
      native_name: display.native_name,
      short_code: display.short_code,
      flag_image: display.flag_image,
      region: display.region,
      accent_color: display.accent_color,
      description: display.description,
      first_participation: display.first_participation,
      entityType: display.entityType,
    });

    return {
      countryId: display.id,
      jury: snapshot.availability.jury ? (row.juryPoints as number) : 0,
      televote: snapshot.availability.televote
        ? (row.televotePoints as number)
        : 0,
      total: row.totalPoints,
      rank: row.finalRank,
      topPoints: 0,
    };
  });

  return {
    showId,
    editionId: snapshot.edition.id,
    publication: "published",
    juryPublished: snapshot.availability.jury,
    televotePublished: snapshot.availability.televote,
    standings,
    countries: [...projectedCountries.values()],
    generatedAt: new Date().toISOString(),
  };
}
