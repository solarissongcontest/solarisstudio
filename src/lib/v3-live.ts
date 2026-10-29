import type { Show } from "@/lib/data";
import {
  resolveShowCompanionState,
  safeShowModeYoutubeUrl,
  type ShowModeTelevoteRound,
} from "@/lib/show-mode";

export type V3PublicShowState =
  | "upcoming"
  | "starting_soon"
  | "live"
  | "paused"
  | "delayed"
  | "voting"
  | "results_pending"
  | "complete"
  | "cancelled";

export type V3LiveVotingState = {
  state: "unavailable" | "upcoming" | "open" | "closed";
  label: string;
  roundId: string | null;
  openedAt: string | null;
  closedAt: string | null;
};

export type V3LiveRevealState = {
  state: "hidden" | "live" | "complete";
  version: number | null;
  currentStep: number;
  totalSteps: number;
  lastRevealedId: string | null;
  updatedAt: string | null;
};

export type V3LiveTiming = {
  scheduledStart: string | null;
  liveStartedAt: string | null;
  resultsStartedAt: string | null;
  endedAt: string | null;
};

export type V3LiveEntrySummary = {
  id: string;
  runningOrder: number | null;
  countryId: string;
  countryName: string;
  flagImage: string | null;
  artist: string | null;
  song: string | null;
};

export type V3LiveExperience = {
  show: {
    id: string;
    editionId: string;
    name: string;
  };
  state: V3PublicShowState;
  stateLabel: string;
  description: string;
  currentPerformance?: V3LiveEntrySummary;
  nextPerformance?: V3LiveEntrySummary;
  progress?: {
    current: number;
    total: number;
  };
  runningOrder: V3LiveEntrySummary[];
  voting: V3LiveVotingState;
  reveal: V3LiveRevealState;
  timing: V3LiveTiming;
  resultsPublished: boolean;
  broadcast?: {
    href: string;
    label: string;
  };
  updates: readonly [];
  freshness: {
    stateVersion: string;
    updatedAt: string;
    serverTime: string;
  };
};

const STARTING_SOON_WINDOW_MS = 30 * 60 * 1000;
const HIDDEN_REVEAL: V3LiveRevealState = {
  state: "hidden",
  version: null,
  currentStep: 0,
  totalSteps: 0,
  lastRevealedId: null,
  updatedAt: null,
};

function normalizedShowStatus(show: Pick<Show, "status">) {
  return show.status.trim().toLowerCase().replaceAll("-", "_");
}

function resolvePublicShowState(input: {
  show: Show;
  televoteRound: ShowModeTelevoteRound | null;
  serverTime: string;
}): V3PublicShowState {
  const status = normalizedShowStatus(input.show);
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "paused") return "paused";
  if (status === "delayed") return "delayed";

  const companion = resolveShowCompanionState({
    show: input.show,
    televoteRound: input.televoteRound,
  });
  if (companion.phase === "voting_open") return "voting";
  if (
    companion.phase === "voting_closed" ||
    companion.phase === "results_in_progress"
  ) {
    return "results_pending";
  }
  if (
    companion.phase === "results_published" ||
    companion.phase === "ended"
  ) {
    return "complete";
  }
  if (companion.phase === "live") return "live";

  const scheduledStart = companion.config.scheduledStart
    ? Date.parse(companion.config.scheduledStart)
    : Number.NaN;
  const now = Date.parse(input.serverTime);
  if (
    Number.isFinite(scheduledStart) &&
    Number.isFinite(now) &&
    scheduledStart >= now &&
    scheduledStart - now <= STARTING_SOON_WINDOW_MS
  ) {
    return "starting_soon";
  }
  return "upcoming";
}

function votingState(
  round: ShowModeTelevoteRound | null,
): V3LiveVotingState {
  if (!round) {
    return {
      state: "unavailable",
      label: "No public vote",
      roundId: null,
      openedAt: null,
      closedAt: null,
    };
  }
  if (round.status === "open") {
    return {
      state: "open",
      label: "Voting open",
      roundId: round.id,
      openedAt: round.openedAt,
      closedAt: round.closedAt,
    };
  }
  if (round.status === "closed") {
    return {
      state: "closed",
      label: "Voting closed",
      roundId: round.id,
      openedAt: round.openedAt,
      closedAt: round.closedAt,
    };
  }
  return {
    state: "upcoming",
    label: "Voting upcoming",
    roundId: round.id,
    openedAt: round.openedAt,
    closedAt: round.closedAt,
  };
}

function projectionStateVersion(input: {
  show: Show;
  round: ShowModeTelevoteRound | null;
  state: V3PublicShowState;
  resultsPublished: boolean;
  reveal: V3LiveRevealState;
}) {
  return [
    input.show.id,
    input.show.status,
    input.state,
    input.round?.id ?? "no-round",
    input.round?.status ?? "none",
    input.resultsPublished ? "results-public" : "results-hidden",
    `reveal-${input.reveal.state}`,
    input.reveal.version ?? "no-reveal-version",
    input.reveal.currentStep,
  ].join(":");
}

/**
 * Public V3 Live projects only canonical state supplied by the server source.
 *
 * Solaris does not currently expose an authoritative current-performance cursor.
 * Consequently this projector intentionally leaves current/next/progress absent
 * instead of inferring them from wall-clock time or the running order.
 *
 * Reveal progress is also server-supplied. Before the lifecycle reaches Live,
 * the source supplies only the hidden projection, so an Armed sequence cannot
 * leak future result order through Public Live.
 */
export function projectV3LiveExperience(input: {
  show: Show;
  televoteRound: ShowModeTelevoteRound | null;
  runningOrder: V3LiveEntrySummary[];
  reveal?: V3LiveRevealState;
  serverTime: string;
  generatedAt: string;
}): V3LiveExperience {
  const companion = resolveShowCompanionState({
    show: input.show,
    televoteRound: input.televoteRound,
  });
  const state = resolvePublicShowState({
    show: input.show,
    televoteRound: input.televoteRound,
    serverTime: input.serverTime,
  });
  const youtubeUrl = safeShowModeYoutubeUrl(companion.config.youtubeUrl);
  const reveal = input.reveal ?? HIDDEN_REVEAL;

  return {
    show: {
      id: input.show.id,
      editionId: input.show.edition_id,
      name: input.show.name,
    },
    state,
    stateLabel: companion.label,
    description: companion.description,
    runningOrder: [...input.runningOrder].sort(
      (a, b) =>
        (a.runningOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.runningOrder ?? Number.MAX_SAFE_INTEGER),
    ),
    voting: votingState(input.televoteRound),
    reveal,
    timing: {
      scheduledStart: companion.config.scheduledStart,
      liveStartedAt: companion.config.liveStartedAt,
      resultsStartedAt: companion.config.resultsStartedAt,
      endedAt: companion.config.endedAt,
    },
    resultsPublished: companion.resultsPublished,
    ...(youtubeUrl
      ? { broadcast: { href: youtubeUrl, label: "Watch broadcast" } }
      : {}),
    updates: [],
    freshness: {
      stateVersion: projectionStateVersion({
        show: input.show,
        round: input.televoteRound,
        state,
        resultsPublished: companion.resultsPublished,
        reveal,
      }),
      updatedAt: input.generatedAt,
      serverTime: input.serverTime,
    },
  };
}
