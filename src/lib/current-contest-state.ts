import type { Edition, ResultRow, Show } from "./data";
import { normalizeLegacyEditionStatus, type EditionState } from "./edition-state";

export type PublicContestPhase =
  | "between_editions"
  | "announced"
  | "confirmations"
  | "submissions"
  | "pre_show"
  | "jury_voting"
  | "live"
  | "voting"
  | "results_pending"
  | "results_published"
  | "post_edition";

export type PublicContestAction = {
  label: string;
  to: string;
};

export type PublicContestState = {
  edition: Edition | null;
  phase: PublicContestPhase;
  lifecycle: EditionState | null;
  statusLabel: string;
  headline: string;
  description: string;
  primaryAction: PublicContestAction | null;
};

const LIVE_SHOW_STATUSES = new Set(["live", "on_air", "on-air", "in_progress", "in-progress"]);

function editionNumber(edition: Edition) {
  return edition.edition_number ?? -1;
}

function isTerminalLifecycle(state: EditionState) {
  return state === "post_edition" || state === "archived";
}

export function resolveCurrentPublicEdition(
  editions: readonly Edition[],
): Edition | null {
  const published = editions
    .filter((edition) => edition.published)
    .sort((a, b) => editionNumber(b) - editionNumber(a));

  return (
    published.find(
      (edition) => !isTerminalLifecycle(normalizeLegacyEditionStatus(edition.status)),
    ) ??
    published[0] ??
    null
  );
}

function exactLiveShow(shows: readonly Show[]) {
  return shows.find((show) => LIVE_SHOW_STATUSES.has(show.status.trim().toLowerCase())) ?? null;
}

function finalResultPublished(
  edition: Edition,
  shows: readonly Show[],
  results: readonly ResultRow[],
) {
  const finalShowIds = new Set(
    shows
      .filter(
        (show) =>
          show.edition_id === edition.id &&
          show.kind === "grand-final" &&
          show.published,
      )
      .map((show) => show.id),
  );

  return results.some(
    (result) =>
      result.edition_id === edition.id &&
      result.show_id != null &&
      finalShowIds.has(result.show_id) &&
      result.final_rank === 1,
  );
}

function phaseFromLifecycle(state: EditionState): PublicContestPhase {
  switch (state) {
    case "draft":
    case "planning":
    case "host_selection":
      return "announced";
    case "confirmations":
      return "confirmations";
    case "submissions":
      return "submissions";
    case "pre_show":
    case "rehearsals":
      return "pre_show";
    case "jury_voting":
      return "jury_voting";
    case "live_show":
      return "live";
    case "televoting":
      return "voting";
    case "vote_verification":
      return "results_pending";
    case "results":
      return "results_published";
    case "post_edition":
    case "archived":
      return "post_edition";
  }
}

function editionPath(edition: Edition) {
  return `/editions/${edition.slug}`;
}

function presentation(
  edition: Edition,
  phase: PublicContestPhase,
): Omit<PublicContestState, "edition" | "phase" | "lifecycle"> {
  const path = editionPath(edition);
  const label = edition.edition_number == null ? edition.name : `SSC ${edition.edition_number}`;

  switch (phase) {
    case "announced":
      return {
        statusLabel: "Upcoming",
        headline: `${label} is taking shape`,
        description: "Explore the published edition information and follow what comes next.",
        primaryAction: { label: "Explore edition", to: path },
      };
    case "confirmations":
      return {
        statusLabel: "Confirmations",
        headline: `${label} confirmations are underway`,
        description: "Delegations are confirming participation and preparing their submissions.",
        primaryAction: { label: "Open participation", to: "/participate" },
      };
    case "submissions":
      return {
        statusLabel: "Current edition",
        headline: `${label} is the current Solaris edition`,
        description: "Explore the edition, participating countries and published entry information.",
        primaryAction: { label: "Explore edition", to: path },
      };
    case "pre_show":
      return {
        statusLabel: "Coming up",
        headline: `${label} is approaching show time`,
        description: "The edition is moving from submissions into the show period.",
        primaryAction: { label: "Open edition", to: path },
      };
    case "jury_voting":
      return {
        statusLabel: "Jury voting",
        headline: `${label} jury voting is in progress`,
        description: "Eligible delegation juries can complete their official ballots.",
        primaryAction: { label: "Open participation", to: "/participate" },
      };
    case "live":
      return {
        statusLabel: "Live",
        headline: `${label} is live`,
        description: "Follow the current show and live contest information.",
        primaryAction: { label: "Open edition", to: path },
      };
    case "voting":
      return {
        statusLabel: "Voting open",
        headline: `${label} voting is open`,
        description: "Open the participation area for the voting options currently available to you.",
        primaryAction: { label: "Vote now", to: "/participate" },
      };
    case "results_pending":
      return {
        statusLabel: "Results pending",
        headline: `${label} voting has closed`,
        description: "Results are being verified and will appear once they are published.",
        primaryAction: { label: "Open edition", to: path },
      };
    case "results_published":
      return {
        statusLabel: "Results",
        headline: `${label} results are published`,
        description: "See the final ranking and detailed result information.",
        primaryAction: { label: "View results", to: path },
      };
    case "post_edition":
      return {
        statusLabel: "Completed",
        headline: `${label} is complete`,
        description: "Explore the final results, entries and archive from the completed edition.",
        primaryAction: { label: "Explore edition", to: path },
      };
    case "between_editions":
      return {
        statusLabel: "Solaris",
        headline: "Explore the Solaris Song Contest",
        description: "Browse countries, editions, results and stories from the archive.",
        primaryAction: { label: "Explore Solaris", to: "/explore" },
      };
  }
}

export function resolvePublicEditionState({
  edition,
  shows,
  results,
}: {
  edition: Edition;
  shows: readonly Show[];
  results: readonly ResultRow[];
}): PublicContestState {
  return resolvePublicEditionState({
    edition,
    shows,
    results,
  });
}

export function resolvePublicContestState({
  editions,
  shows,
  results,
}: {
  editions: readonly Edition[];
  shows: readonly Show[];
  results: readonly ResultRow[];
}): PublicContestState {
  const edition = resolveCurrentPublicEdition(editions);

  if (!edition) {
    const base = presentation(
      {
        id: "",
        edition_number: null,
        name: "",
        year: null,
        slug: "",
        description: null,
        host_country_id: null,
        host_city: null,
        logo: null,
        theme_id: null,
        status: "archived",
        published: false,
      },
      "between_editions",
    );
    return {
      edition: null,
      phase: "between_editions",
      lifecycle: null,
      ...base,
    };
  }

  const lifecycle = normalizeLegacyEditionStatus(edition.status);
  const editionShows = shows.filter((show) => show.edition_id === edition.id);

  const phase = exactLiveShow(editionShows)
    ? "live"
    : finalResultPublished(edition, editionShows, results)
      ? "results_published"
      : phaseFromLifecycle(lifecycle);

  return {
    edition,
    phase,
    lifecycle,
    ...presentation(edition, phase),
  };
}
