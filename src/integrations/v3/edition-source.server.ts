import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  resolvePublicEditionState,
  type PublicContestPhase,
} from "@/lib/current-contest-state";
import type { Edition, ResultRow, Show } from "@/lib/data";
import { normalizeLegacyEditionStatus } from "@/lib/edition-state";
import { resolveShowPublication } from "@/lib/publication";
import {
  buildV3EditionHubProjection,
  type V3EditionExperience,
  type V3EditionHubProjection,
  type V3ExploreEditionInput,
} from "@/lib/v3-explore";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,artwork_url,status,published";
const SHOW_COLUMNS =
  "id,edition_id,name,kind,sort_order,status,published,publication_config";
const RESULT_COLUMNS =
  "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank";

type EditionSourceRow = Edition & { artwork_url?: string | null };

type EditionClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

type EditionCounts = {
  participants: number;
  songs: number;
  stories: number;
};

export type V3EditionServerBundle = {
  projection: V3EditionHubProjection | null;
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
    throw new Error(`Invalid V3 Edition ${label} count`);
  }
  return number;
}

function parseCounts(value: unknown): EditionCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid V3 Edition count projection");
  }
  const row = value as Record<string, unknown>;
  return {
    participants: safeCount(row.participants, "participants"),
    songs: safeCount(row.songs, "songs"),
    stories: safeCount(row.stories, "stories"),
  };
}

function experienceFromPhase(
  phase: PublicContestPhase,
  edition: EditionSourceRow,
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

function editionLabel(edition: EditionSourceRow) {
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function editionInput(input: {
  edition: EditionSourceRow;
  shows: readonly Show[];
  results: readonly ResultRow[];
  phase: PublicContestPhase;
}): V3ExploreEditionInput {
  const { edition, shows, results, phase } = input;
  const experience = experienceFromPhase(phase, edition);
  const resultsPublished = finalResultsPublished(shows, results);
  const lifecycle = normalizeLegacyEditionStatus(edition.status);

  return {
    id: edition.id,
    slug: edition.slug,
    name: edition.name,
    editionNumber: edition.edition_number,
    year: edition.year,
    hostLabel: edition.host_city,
    artworkUrl: edition.artwork_url ?? edition.logo ?? null,
    visibility: edition.published ? "public" : "private",
    experience,
    resultsPublication: resultsPublished ? "published" : "hidden",
    href: `/editions/${edition.slug}`,
    liveHref: experience === "live" ? "/show-mode" : null,
    nextEvent: null,
    archiveEligible: lifecycle === "post_edition" || lifecycle === "archived",
  };
}

/**
 * Publication-safe V3 Edition hub source. It deliberately projects only the
 * hub state required by the installed app. Deep Edition sections continue to
 * use the existing canonical public route during this migration slice.
 */
export async function loadV3EditionBundle(slug: string): Promise<V3EditionServerBundle> {
  const cleanSlug = slug.trim();
  if (!cleanSlug) {
    return {
      projection: null,
      shell: { editionLabel: "Solaris Song Contest", phaseLabel: null },
      generatedAt: new Date().toISOString(),
    };
  }

  const client = createConfirmationPublicRuntimeClient() as unknown as EditionClient;
  const editionResult = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("slug", cleanSlug)
    .eq("published", true)
    .maybeSingle();

  throwIfError(editionResult.error, "Could not load public Solaris edition");
  const edition = (editionResult.data ?? null) as EditionSourceRow | null;

  if (!edition) {
    return {
      projection: null,
      shell: { editionLabel: "Solaris Song Contest", phaseLabel: null },
      generatedAt: new Date().toISOString(),
    };
  }

  const [showsResult, resultsResult, countsResult] = await Promise.all([
    client
      .from("shows")
      .select(SHOW_COLUMNS)
      .eq("edition_id", edition.id)
      .eq("published", true)
      .order("sort_order", { ascending: true }),
    client
      .from("results")
      .select(RESULT_COLUMNS)
      .eq("edition_id", edition.id),
    client.rpc("v3_public_edition_hub_counts", { _edition_id: edition.id }),
  ]);

  throwIfError(showsResult.error, "Could not load public Edition shows");
  throwIfError(resultsResult.error, "Could not load public Edition result state");
  throwIfError(countsResult.error, "Could not load V3 Edition section counts");

  const shows = (showsResult.data ?? []) as Show[];
  const results = (resultsResult.data ?? []) as ResultRow[];
  const counts = parseCounts(countsResult.data);
  const state = resolvePublicEditionState({ edition, shows, results });
  const projectedEdition = editionInput({
    edition,
    shows,
    results,
    phase: state.phase,
  });
  const baseHref = `/editions/${edition.slug}`;
  const projection = buildV3EditionHubProjection({
    edition: projectedEdition,
    sections: {
      overview: { state: "available", href: `${baseHref}#edition-overview` },
      participants: {
        state: counts.participants > 0 ? "available" : "empty",
        href: `${baseHref}#edition-countries`,
      },
      songs: {
        state: counts.songs > 0 ? "available" : "empty",
        href: `${baseHref}#edition-entries`,
      },
      schedule: {
        state: shows.length > 0 ? "available" : "empty",
        href: `${baseHref}#edition-shows`,
      },
      stories: {
        state: counts.stories > 0 ? "available" : "empty",
        href: `${baseHref}#edition-stories`,
      },
      results: {
        state: projectedEdition.resultsPublication === "published" ? "available" : "empty",
        href: `${baseHref}#edition-results`,
      },
    },
  });

  return {
    projection,
    shell: {
      editionLabel: editionLabel(edition),
      phaseLabel: state.statusLabel,
    },
    generatedAt: new Date().toISOString(),
  };
}
