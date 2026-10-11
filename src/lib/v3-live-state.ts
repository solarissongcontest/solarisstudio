import type {
  V3ContestDomainSnapshot,
  V3ResultsState,
  V3ShowState,
  V3TelevoteState,
} from "./v3-domain-state";

export type V3LiveSeverity = "neutral" | "info" | "warning" | "critical" | "success";

export type V3LiveStatus =
  | "not_live"
  | "preparing"
  | "delayed"
  | "live"
  | "paused"
  | "ended"
  | "cancelled"
  | "voting_open"
  | "voting_extended"
  | "voting_paused"
  | "results_delayed"
  | "results_published";

export type V3LiveProjection = {
  status: V3LiveStatus;
  severity: V3LiveSeverity;
  headline: string;
  detail: string;
  showInteractive: boolean;
  votingInteractive: boolean;
  resultsAvailable: boolean;
  preserveRunningOrder: boolean;
  showRecoveryMessage: boolean;
};

function resultsAvailable(results: V3ResultsState) {
  return results === "published" || results === "corrected";
}

function showEnded(show: V3ShowState | null) {
  return show === "ended" || show === "cancelled";
}

function resultsDelayed(snapshot: V3ContestDomainSnapshot) {
  if (!showEnded(snapshot.show)) return false;
  if (resultsAvailable(snapshot.results)) return false;
  return snapshot.results === "hidden" || snapshot.results === "prepared" || snapshot.results === "reviewing" || snapshot.results === "approved";
}

function votingOpen(televote: V3TelevoteState | null) {
  return televote === "open" || televote === "extended";
}

/**
 * Projects public/participant live status from canonical domain state without
 * assuming the show follows the happy path. The same projection can feed Home,
 * a full Live surface and organizer-facing read-only status labels.
 */
export function projectV3LiveState(snapshot: V3ContestDomainSnapshot): V3LiveProjection {
  const resultsPublic = resultsAvailable(snapshot.results);

  if (resultsPublic) {
    return {
      status: "results_published",
      severity: "success",
      headline: "Results are available",
      detail: "The official result has been published.",
      showInteractive: false,
      votingInteractive: false,
      resultsAvailable: true,
      preserveRunningOrder: true,
      showRecoveryMessage: false,
    };
  }

  if (snapshot.show === "cancelled") {
    return {
      status: "cancelled",
      severity: "critical",
      headline: "Show cancelled",
      detail: "The show will not continue in its current scheduled form.",
      showInteractive: false,
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.show === "delayed") {
    return {
      status: "delayed",
      severity: "warning",
      headline: "Show delayed",
      detail: "The start or current programme is delayed. Solaris will keep this status updated.",
      showInteractive: true,
      votingInteractive: votingOpen(snapshot.televote),
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.show === "paused") {
    return {
      status: "paused",
      severity: "warning",
      headline: "Show temporarily paused",
      detail: "The live show is paused. Current running-order context is preserved until it resumes.",
      showInteractive: true,
      votingInteractive: votingOpen(snapshot.televote),
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.televote === "paused") {
    return {
      status: "voting_paused",
      severity: "warning",
      headline: "Voting temporarily paused",
      detail: "Voting is not accepting new submissions until the organizer resumes the window.",
      showInteractive: snapshot.show === "live",
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.televote === "extended") {
    return {
      status: "voting_extended",
      severity: "info",
      headline: "Voting extended",
      detail: "The voting window remains open beyond its original closing time.",
      showInteractive: snapshot.show === "live" || snapshot.show === "ended",
      votingInteractive: true,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.televote === "open") {
    return {
      status: "voting_open",
      severity: "info",
      headline: "Voting is open",
      detail: "The current public voting window is accepting submissions.",
      showInteractive: snapshot.show === "live" || snapshot.show === "ended",
      votingInteractive: true,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: false,
    };
  }

  if (snapshot.show === "live") {
    return {
      status: "live",
      severity: "info",
      headline: "Live now",
      detail: "The show is currently in progress.",
      showInteractive: true,
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: false,
    };
  }

  if (resultsDelayed(snapshot)) {
    return {
      status: "results_delayed",
      severity: "warning",
      headline: "Results not published yet",
      detail: "The show has ended, but the official result is still being prepared or reviewed.",
      showInteractive: false,
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: true,
    };
  }

  if (snapshot.show === "preparing") {
    return {
      status: "preparing",
      severity: "neutral",
      headline: "Show day",
      detail: "The show is preparing to go live.",
      showInteractive: true,
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: false,
    };
  }

  if (snapshot.show === "ended") {
    return {
      status: "ended",
      severity: "neutral",
      headline: "Show ended",
      detail: "The live programme has ended.",
      showInteractive: false,
      votingInteractive: false,
      resultsAvailable: false,
      preserveRunningOrder: true,
      showRecoveryMessage: false,
    };
  }

  return {
    status: "not_live",
    severity: "neutral",
    headline: "Not live",
    detail: "There is no live show state right now.",
    showInteractive: snapshot.show === "scheduled",
    votingInteractive: false,
    resultsAvailable: false,
    preserveRunningOrder: true,
    showRecoveryMessage: false,
  };
}
