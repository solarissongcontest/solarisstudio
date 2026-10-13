import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  resolveCurrentPublicEdition,
  resolvePublicEditionState,
  type PublicContestPhase,
} from "@/lib/current-contest-state";
import type { Edition, ResultRow, Show } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import { resolveShowPublication } from "@/lib/publication";
import {
  buildV3ExploreRootProjection,
  type V3EditionExperience,
  type V3ExploreEditionInput,
  type V3ExploreRootProjection,
} from "@/lib/v3-explore";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,artwork_url,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";
const RESULT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank";

type ExploreEdition = Edition & { artwork_url?: string | null };

type ExploreClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type ExploreCounts = {
  countries: number;
  entries: number;
  shows: number;
  stories: number;
};

export type V3ExploreServerBundle = {
  projection: V3ExploreRootProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string | null;
  };
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

function safeCount(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid ${label} count`);
  }
  return number;
}

function parseCounts(value: unknown): ExploreCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid V3 Explore count projection");
  }
  const row = value as Record<string, unknown>;
  return {
    countries: safeCount(row.countries, "countries"),
    entries: safeCount(row.entries, "entries"),
    shows: safeCount(row.shows, "shows"),
    stories: safeCount(row.stories, "stories"),
  };
}

function experienceFromPhase(
  phase: PublicContestPhase,
  edition: ExploreEdition,
): V3EditionExperience {
  switch (phase) {
    case "live":
      return "live";
    case "results_published":
      return "results";
    case "post_edition":
      return normalizeLegacyEditionStatus(edition.status) === "archived"
        ? "archived"
        : "post-edition";
    case "jury_voting":
    case "voting":
    case "results_pending":
      return "show-day";
    case "pre_show":
    case "submissions":
    case "confirmations":
      return "pre-show";
    case "announced":
    case "between_editions":
      return "upcoming";
  }
}

function archiveExperience(edition: ExploreEdition): V3EditionExperience {
  return normalizeLegacyEditionStatus(edition.status) === "archived"
    ? "archived"
    : "post-edition";
}

function finalResultsPublished(shows: readonly Show[], results: readonly ResultRow[]) {
  const publicFinals = new Set(
    shows
      .filter(
        (show) =>
          (show.kind === "grand-final" || show.kind === "final") &&
          resolveShowPublication(show).results,
      )
      .map((show) => show.id),
  );
  return results.some(
    (result) =>
      result.show_id != null &&
      publicFinals.has(result.show_id) &&
      result.final_rank === 1,
  );
}

function editionLabel(edition: ExploreEdition | null) {
  if (!edition) return "Solaris Song Contest";
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function makeEditionInput(input: {
  edition: ExploreEdition;
  currentEditionId: string | null;
  currentExperience: V3EditionExperience | null;
  currentResultsPublished: boolean;
}): V3ExploreEditionInput {
  const { edition, currentEditionId, currentExperience, currentResultsPublished } = input;
  const isCurrent = edition.id === currentEditionId;
  const lifecycle = normalizeLegacyEditionStatus(edition.status);
  const archiveEligible = lifecycle === "post_edition" || lifecycle === "archived";

  return {
    id: edition.id,
    slug: edition.slug,
    name: edition.name,
    editionNumber: edition.edition_number,
    year: edition.year,
    hostLabel: edition.host_city,
    artworkUrl: edition.artwork_url ?? edition.logo ?? null,
    visibility: edition.published ? "public" : "private",
    experience:
      isCurrent && currentExperience ? currentExperience : archiveExperience(edition),
    resultsPublication:
      isCurrent && currentResultsPublished ? "published" : "hidden",
    href: `/editions/${edition.slug}`,
    liveHref: isCurrent && currentExperience === "live" ? "/show-mode" : null,
    nextEvent: null,
    archiveEligible,
  };
}

/**
 * Server-owned public Explore source. It intentionally returns one narrow V3
 * projection instead of reproducing the legacy installed-app archive query fanout.
 * Publication-sensitive entry counts are computed by a database projection that
 * delegates to public_safe_participants, never by reading raw participant rows.
 */
export async function loadCurrentV3ExploreBundle(): Promise<V3ExploreServerBundle> {
  const client = createConfirmationPublicRuntimeClient() as unknown as ExploreClient;

  const [editionResult, countsResult] = await Promise.all([
    client
      .from("editions")
      .select(EDITION_COLUMNS)
      .eq("published", true)
      .order("edition_number", { ascending: false }),
    client.rpc("v3_public_explore_counts"),
  ]);

  throwIfError(editionResult.error, "Could not load public Solaris editions");
  throwIfError(countsResult.error, "Could not load V3 Explore discovery counts");

  const editions = (editionResult.data ?? []) as ExploreEdition[];
  const counts = parseCounts(countsResult.data);
  const currentEdition = resolveCurrentPublicEdition(editions);

  let currentShows: Show[] = [];
  let currentResults: ResultRow[] = [];
  let phaseLabel: string | null = null;
  let currentExperience: V3EditionExperience | null = null;
  let currentResultsPublished = false;

  if (currentEdition) {
    const [showsResult, resultsResult] = await Promise.all([
      client
        .from("shows")
        .select(SHOW_COLUMNS)
        .eq("edition_id", currentEdition.id)
        .eq("published", true)
        .order("sort_order", { ascending: true }),
      client
        .from("results")
        .select(RESULT_COLUMNS)
        .eq("edition_id", currentEdition.id),
    ]);
    throwIfError(showsResult.error, "Could not load current public shows");
    throwIfError(resultsResult.error, "Could not load current public result state");

    currentShows = (showsResult.data ?? []) as Show[];
    currentResults = (resultsResult.data ?? []) as ResultRow[];
    const state = resolvePublicEditionState({
      edition: currentEdition,
      shows: currentShows,
      results: currentResults,
    });
    phaseLabel = state.statusLabel;
    currentExperience = experienceFromPhase(state.phase, currentEdition);
    currentResultsPublished = finalResultsPublished(currentShows, currentResults);
  }

  const projected = buildV3ExploreRootProjection({
    currentEditionId: currentEdition?.id ?? null,
    editions: editions.map((edition) =>
      makeEditionInput({
        edition,
        currentEditionId: currentEdition?.id ?? null,
        currentExperience,
        currentResultsPublished,
      }),
    ),
    countries: [],
    songs: [],
    artists: [],
    shows: [],
    stories: [],
    routes: {
      countries: "/countries",
      songsAndArtists: currentEdition ? `/editions/${currentEdition.slug}` : "/editions",
      shows: "/shows",
      stories: "/stories",
      editionsArchive: "/editions",
      wiki: "/wiki",
      encyclopedia: "/encyclopedia",
      archiveGames: "/archive-games",
      advancedDiscovery: "/site-directory",
    },
  });

  const countByKey = {
    countries: counts.countries,
    "songs-and-artists": counts.entries,
    shows: counts.shows,
    stories: counts.stories,
  } as const;

  return {
    projection: {
      ...projected,
      discover: projected.discover.map((collection) => ({
        ...collection,
        publicItemCount: countByKey[collection.key],
      })),
    },
    shell: {
      editionLabel: editionLabel(currentEdition),
      phaseLabel,
    },
    generatedAt: new Date().toISOString(),
  };
}
