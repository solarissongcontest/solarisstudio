import type { Show } from "@/lib/data";
import {
  DEFAULT_SHOW_MODE,
  resolveBroadcast,
  type ShowModeConfig,
  type ShowModeManualPhase,
} from "@/lib/broadcast";
import { resolveShowPublication } from "@/lib/publication";

export type ShowModeTelevoteRound = {
  id: string;
  name: string;
  status: "draft" | "open" | "closed";
  openedAt: string | null;
  closedAt: string | null;
};

export type ShowCompanionPhase =
  | "scheduled"
  | "live"
  | "voting_open"
  | "voting_closed"
  | "results_in_progress"
  | "results_published"
  | "ended";

export type ShowCompanionState = {
  phase: ShowCompanionPhase;
  label: string;
  description: string;
  resultsPublished: boolean;
  votingOpen: boolean;
  votingClosed: boolean;
  config: ShowModeConfig;
};

const LIVE_SHOW_STATUSES = new Set([
  "live",
  "on_air",
  "on-air",
  "in_progress",
  "in-progress",
]);

function isValidDate(value: string | null) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

export function showModeConfig(show: Pick<Show, "broadcast_config"> | null | undefined) {
  return show ? resolveBroadcast(show.broadcast_config).showMode : { ...DEFAULT_SHOW_MODE };
}

export function transitionShowModePhase(
  current: ShowModeConfig,
  phase: ShowModeManualPhase,
  now = new Date().toISOString(),
): ShowModeConfig {
  if (phase === "scheduled") {
    return {
      ...current,
      phase,
      liveStartedAt: null,
      resultsStartedAt: null,
      endedAt: null,
    };
  }

  if (phase === "live") {
    return {
      ...current,
      phase,
      liveStartedAt: current.liveStartedAt ?? now,
      resultsStartedAt: null,
      endedAt: null,
    };
  }

  if (phase === "results_in_progress") {
    return {
      ...current,
      phase,
      liveStartedAt: current.liveStartedAt ?? now,
      resultsStartedAt: current.resultsStartedAt ?? now,
      endedAt: null,
    };
  }

  return {
    ...current,
    phase,
    liveStartedAt: current.liveStartedAt ?? now,
    endedAt: current.endedAt ?? now,
  };
}

export function safeShowModeYoutubeUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      url.protocol !== "https:" ||
      !(
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be"
      )
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveShowCompanionState({
  show,
  televoteRound,
}: {
  show: Show;
  televoteRound?: ShowModeTelevoteRound | null;
}): ShowCompanionState {
  const config = showModeConfig(show);
  const publication = resolveShowPublication(show);
  const resultsPublished = publication.results === true;

  const votingOpen = televoteRound?.status === "open";
  const votingClosed = televoteRound?.status === "closed";

  let phase: ShowCompanionPhase;

  if (config.phase === "ended") {
    phase = "ended";
  } else if (resultsPublished) {
    phase = "results_published";
  } else if (config.phase === "results_in_progress") {
    phase = "results_in_progress";
  } else if (votingOpen) {
    phase = "voting_open";
  } else if (votingClosed) {
    phase = "voting_closed";
  } else if (
    config.phase === "live" ||
    LIVE_SHOW_STATUSES.has(show.status.trim().toLowerCase())
  ) {
    phase = "live";
  } else {
    phase = "scheduled";
  }

  const presentation: Record<
    ShowCompanionPhase,
    { label: string; description: string }
  > = {
    scheduled: {
      label: "Scheduled",
      description: isValidDate(config.scheduledStart)
        ? "The show is scheduled. Actual YouTube broadcast timing may vary."
        : "The show has not been marked live yet.",
    },
    live: {
      label: "Live",
      description:
        "The show is live. Solaris does not guess the current performance or YouTube timing.",
    },
    voting_open: {
      label: "Voting open",
      description: televoteRound
        ? televoteRound.name + " is officially open for voting."
        : "The official voting round is open.",
    },
    voting_closed: {
      label: "Voting closed",
      description: televoteRound
        ? televoteRound.name + " has closed."
        : "The official voting round has closed.",
    },
    results_in_progress: {
      label: "Results live",
      description:
        "The results segment has started. Official rankings remain hidden until Solaris publishes them.",
    },
    results_published: {
      label: "Results published",
      description:
        "The official show result is now published in Solaris Studio.",
    },
    ended: {
      label: "Ended",
      description: resultsPublished
        ? "The show has ended. Official results remain available."
        : "The show has ended.",
    },
  };

  return {
    phase,
    ...presentation[phase],
    resultsPublished,
    votingOpen,
    votingClosed,
    config,
  };
}

function scheduledDistance(show: Show, now: number) {
  const value = showModeConfig(show).scheduledStart;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  if (time >= now) return time - now;
  return (now - time) + 1000 * 60 * 60 * 24 * 14;
}

function manualPriority(show: Show) {
  const config = showModeConfig(show);
  if (config.phase === "results_in_progress") return 0;
  if (config.phase === "live") return 1;
  if (LIVE_SHOW_STATUSES.has(show.status.trim().toLowerCase())) return 1;
  if (config.phase === "scheduled") return 2;
  if (config.phase === "ended") return 4;
  return 3;
}

export function preferredShowModeShow(
  shows: readonly Show[],
  now = Date.now(),
): Show | null {
  return (
    [...shows].sort((a, b) => {
      const priority = manualPriority(a) - manualPriority(b);
      if (priority) return priority;

      const distance = scheduledDistance(a, now) - scheduledDistance(b, now);
      if (distance) return distance;

      return a.sort_order - b.sort_order;
    })[0] ?? null
  );
}
