import type {
  CountryConfirmationRequirement,
  CountryConfirmationResponse,
} from "./confirmation-country-account";
import {
  resolveCurrentPublicEdition,
  resolvePublicContestState,
  resolvePublicEditionState,
} from "./current-contest-state";
import type { Edition, ResultRow, Show } from "./data";
import { buildParticipationTasks, type VotingTaskInput } from "./participation-os";
import { isShowPublic, showPublishesResults } from "./publication";
import type { PublicRound } from "./confirmation-rounds.functions";
import type {
  V3PrimaryActionProgress,
  V3PrimaryHomeListItem,
  V3PrimaryHomeStat,
  V3PrimarySurfaceServerSnapshot,
} from "./v3-primary-surface-bootstrap";

export type V3PrimarySurfaceViewer = {
  id: string;
  displayName: string | null;
};

export type V3PrimarySurfaceDelegation = {
  id: string;
  name: string;
};

export type V3ParticipantIdentityRow = {
  country_id?: string | null;
  contest_entity_id?: string | null;
};

export type V3PrimarySurfaceReadModel = {
  serverTime: string;
  generatedAt?: string;
  targetEditionId?: string | null;
  editions: readonly Edition[];
  shows: readonly Show[];
  results: readonly ResultRow[];
  participantCount?: number | null;
  viewer: V3PrimarySurfaceViewer | null;
  delegation: V3PrimarySurfaceDelegation | null;
  capabilities: readonly string[];
  confirmationResponses: readonly CountryConfirmationResponse[];
  confirmationRequirements: readonly CountryConfirmationRequirement[];
  rounds: readonly PublicRound[];
  acknowledgementTasks: number;
  jury: VotingTaskInput | null;
  televote: VotingTaskInput | null;
  progressByActionId?: Readonly<Record<string, V3PrimaryActionProgress>>;
  hideResultSpoilers?: boolean;
};

const LIVE_STATUSES = new Set([
  "live",
  "on_air",
  "on-air",
  "in_progress",
  "in-progress",
]);

export function countDistinctV3Delegations(rows: readonly V3ParticipantIdentityRow[]) {
  const identities = new Set<string>();
  for (const row of rows) {
    const identity = row.contest_entity_id?.trim() || row.country_id?.trim() || null;
    if (identity) identities.add(identity);
  }
  return identities.size;
}

export function countPendingAcknowledgementTasks(rows: unknown) {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row: any) => {
    return (
      row?.acknowledgement_required === true &&
      row?.acknowledged_at == null &&
      row?.receipt_archived_at == null
    );
  }).length;
}

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms };
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizedStatus(show: Show) {
  return show.status.trim().toLowerCase();
}

function currentOrRequestedEdition(
  editions: readonly Edition[],
  targetEditionId: string | null,
) {
  if (!targetEditionId) return resolveCurrentPublicEdition(editions);
  const edition = editions.find((candidate) => candidate.id === targetEditionId) ?? null;
  if (!edition || !edition.published) {
    throw new Error("Requested V3 bootstrap edition is not a published Solaris edition.");
  }
  return edition;
}

function showHasPublishedResult(show: Show, results: readonly ResultRow[]) {
  if (!showPublishesResults(show)) return false;
  return results.some(
    (result) => result.show_id === show.id && result.final_rank != null,
  );
}

function upcomingItems(
  shows: readonly Show[],
  results: readonly ResultRow[],
): readonly V3PrimaryHomeListItem[] {
  return [...shows]
    .filter(
      (show) =>
        !LIVE_STATUSES.has(normalizedStatus(show)) &&
        !showHasPublishedResult(show, results),
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3)
    .map((show) => ({
      id: `show:${show.id}`,
      title: show.name,
      description: "Public show information is available.",
      to: `/shows/${show.id}`,
    }));
}

function latestItems(input: {
  shows: readonly Show[];
  results: readonly ResultRow[];
  fallback: { label: string; to: string } | null;
  headline: string;
  description: string;
}): readonly V3PrimaryHomeListItem[] {
  const live = input.shows.find((show) => LIVE_STATUSES.has(normalizedStatus(show)));
  const completed = [...input.shows]
    .filter((show) => showHasPublishedResult(show, input.results))
    .sort((a, b) => b.sort_order - a.sort_order);

  const items: V3PrimaryHomeListItem[] = [];
  if (live) {
    items.push({
      id: `live:${live.id}`,
      title: `${live.name} is live`,
      description: "Open the current public show.",
      to: `/shows/${live.id}`,
    });
  }
  for (const show of completed) {
    if (items.length >= 3) break;
    items.push({
      id: `results:${show.id}`,
      title: `${show.name} results`,
      description: "Published results are available.",
      to: `/shows/${show.id}`,
    });
  }

  if (!items.length && input.fallback) {
    items.push({
      id: `contest:${input.fallback.to}`,
      title: input.headline,
      description: input.description,
      to: input.fallback.to,
    });
  }
  return items;
}

function contestStats(
  participantCount: number | null | undefined,
  publicShowCount: number,
): readonly V3PrimaryHomeStat[] {
  const stats: V3PrimaryHomeStat[] = [];
  if (participantCount != null) {
    stats.push({
      value: String(nonNegativeInteger(participantCount, "participantCount")),
      label: "Delegations",
    });
  }
  if (publicShowCount > 0) {
    stats.push({ value: String(publicShowCount), label: "Public shows" });
  }
  return stats;
}

function assertAnonymousIsolation(input: V3PrimarySurfaceReadModel) {
  if (input.viewer) return;
  if (
    input.delegation ||
    input.capabilities.length > 0 ||
    input.confirmationResponses.length > 0 ||
    input.confirmationRequirements.length > 0 ||
    input.acknowledgementTasks > 0 ||
    input.jury
  ) {
    throw new Error(
      "Anonymous V3 bootstrap cannot contain participant-scoped evidence.",
    );
  }
}

export function assembleV3PrimarySurfaceSnapshot(
  input: V3PrimarySurfaceReadModel,
): V3PrimarySurfaceServerSnapshot {
  const serverTime = timestamp(input.serverTime, "serverTime");
  const generatedAt = timestamp(
    input.generatedAt ?? serverTime.value,
    "generatedAt",
  );
  if (generatedAt.ms < serverTime.ms) {
    throw new Error("generatedAt cannot be before serverTime.");
  }
  nonNegativeInteger(input.acknowledgementTasks, "acknowledgementTasks");
  assertAnonymousIsolation(input);

  const targetEditionId = input.targetEditionId?.trim() || null;
  const edition = currentOrRequestedEdition(input.editions, targetEditionId);
  const editionShows = edition
    ? input.shows.filter((show) => show.edition_id === edition.id)
    : [];
  const editionResults = edition
    ? input.results.filter((result) => result.edition_id === edition.id)
    : [];
  const publicShows = editionShows.filter(isShowPublic);

  const publicContest = edition
    ? resolvePublicEditionState({
        edition,
        shows: editionShows,
        results: editionResults,
      })
    : resolvePublicContestState({
        editions: input.editions,
        shows: editionShows,
        results: editionResults,
      });

  const tasks = input.viewer
    ? buildParticipationTasks({
        editionId: edition?.id ?? null,
        responses: input.confirmationResponses,
        requirements: input.confirmationRequirements,
        rounds: input.rounds,
        acknowledgementTasks: input.acknowledgementTasks,
        jury: input.jury,
        televote: input.televote,
        now: serverTime.ms,
      })
    : [];

  const liveShow = publicShows.find((show) =>
    LIVE_STATUSES.has(normalizedStatus(show)),
  );

  return {
    publicContest,
    tasks,
    identity: {
      userId: input.viewer?.id ?? null,
      displayName: input.viewer?.displayName ?? null,
    },
    delegation: input.delegation
      ? { id: input.delegation.id, name: input.delegation.name }
      : null,
    capabilities: input.viewer ? [...input.capabilities] : [],
    serverTime: serverTime.value,
    generatedAt: generatedAt.value,
    hideResultSpoilers: input.hideResultSpoilers ?? false,
    primarySurfaces: {
      upcoming: upcomingItems(publicShows, editionResults),
      latest: latestItems({
        shows: publicShows,
        results: editionResults,
        fallback: publicContest.primaryAction,
        headline: publicContest.headline,
        description: publicContest.description,
      }),
      contestStats: contestStats(input.participantCount, publicShows.length),
      liveShowLabel: publicContest.phase === "live" ? liveShow?.name ?? null : null,
      resultsLabel:
        publicContest.phase === "results_published" ? "Results published" : null,
      progressByActionId: input.progressByActionId ?? {},
    },
  };
}