import type { Show } from "@/lib/data";
import {
  DEFAULT_SHOW_MODE,
  resolveBroadcast,
  type ShowModeConfig,
  type ShowModeManualPhase,
} from "@/lib/broadcast";
import { resolveShowPublication } from "@/lib/publication";
import { canonicalShowLifecycle } from "@/lib/show-runtime-command";

export type ShowModeTelevoteRound = {
  id: string;
  name: string;
  status: "draft" | "open" | "closed";
  openedAt: string | null;
  closedAt: string | null;
};

export type ShowCompanionPhase =
  | "scheduled"
  | "preparing"
  | "delayed"
  | "live"
  | "paused"
  | "voting_open"
  | "voting_closed"
  | "results_in_progress"
  | "results_published"
  | "ended"
  | "cancelled";

export type ShowCompanionState = {
  phase: ShowCompanionPhase;
  label: string;
  description: string;
  resultsPublished: boolean;
  votingOpen: boolean;
  votingClosed: boolean;
  config: ShowModeConfig;
};

function isValidDate(value: string | null) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

/**
 * Returns the companion metadata reconciled against canonical shows.status.
 * Stored showMode.phase is never allowed to override lifecycle truth. The only
 * extra runtime phase retained is results_in_progress while lifecycle is live.
 */
export function showModeConfig(
  show: Pick<Show, "broadcast_config" | "status"> | null | undefined,
): ShowModeConfig {
  if (!show) return { ...DEFAULT_SHOW_MODE };
  const config = resolveBroadcast(show.broadcast_config).showMode;
  const lifecycle = canonicalShowLifecycle(show.status);
  if (lifecycle === "live" && config.phase === "results_in_progress") return config;
  if (lifecycle === "live" || lifecycle === "paused") return { ...config, phase: "live" };
  if (lifecycle === "ended" || lifecycle === "cancelled") return { ...config, phase: "ended" };
  return { ...config, phase: "scheduled" };
}

const LEGAL_SHOW_MODE_TRANSITIONS: Record<ShowModeManualPhase, readonly ShowModeManualPhase[]> = {
  scheduled: ["live"],
  live: ["results_in_progress", "ended"],
  results_in_progress: ["ended"],
  ended: [],
};

/**
 * Compatibility preview for the existing four-option Show Mode sheet.
 * The database command owns the full V3 lifecycle state machine, including
 * preparing/delayed/paused/cancelled. This helper is presentation-only.
 */
export function transitionShowModePhase(
  current: ShowModeConfig,
  phase: ShowModeManualPhase,
  now = new Date().toISOString(),
): ShowModeConfig {
  if (phase !== current.phase && !LEGAL_SHOW_MODE_TRANSITIONS[current.phase].includes(phase)) {
    throw new Error(`Invalid Show Mode transition: ${current.phase} → ${phase}`);
  }

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
  const lifecycle = canonicalShowLifecycle(show.status);
  const publication = resolveShowPublication(show);
  const resultsPublished = publication.results === true;

  const votingOpen = televoteRound?.status === "open";
  const votingClosed = televoteRound?.status === "closed";

  let phase: ShowCompanionPhase;

  if (lifecycle === "cancelled") {
    phase = "cancelled";
  } else if (lifecycle === "ended") {
    phase = "ended";
  } else if (resultsPublished) {
    phase = "results_published";
  } else if (config.phase === "results_in_progress") {
    phase = "results_in_progress";
  } else if (votingOpen) {
    phase = "voting_open";
  } else if (votingClosed) {
    phase = "voting_closed";
  } else if (lifecycle === "paused") {
    phase = "paused";
  } else if (lifecycle === "delayed") {
    phase = "delayed";
  } else if (lifecycle === "preparing") {
    phase = "preparing";
  } else if (lifecycle === "live") {
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
        : "The show has not entered preparation yet.",
    },
    preparing: {
      label: "Preparing",
      description: "The show is in active preparation but has not gone live.",
    },
    delayed: {
      label: "Delayed",
      description: "The show is delayed. Solaris will not infer a new start time locally.",
    },
    live: {
      label: "Live",
      description:
        "The show is live. Solaris does not guess the current performance or YouTube timing.",
    },
    paused: {
      label: "Paused",
      description: "The live show is paused until an authorized operator resumes it.",
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
    cancelled: {
      label: "Cancelled",
      description: "The show has been cancelled and cannot advance through the live lifecycle.",
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
  const lifecycle = canonicalShowLifecycle(show.status);
  const config = showModeConfig(show);
  if (lifecycle === "live" && config.phase === "results_in_progress") return 0;
  if (lifecycle === "live") return 1;
  if (lifecycle === "paused") return 2;
  if (lifecycle === "preparing" || lifecycle === "delayed") return 3;
  if (lifecycle === "scheduled") return 4;
  return 5;
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
