/**
 * V3 contest-domain vocabulary.
 *
 * These domains are intentionally orthogonal and contest-scoped. Personal
 * confirmation, entry, media and jury completion live in the authoritative
 * Participation OS task/workspace evidence and are projected through Journey.
 * Mixing personal workflow state into this contest snapshot would create two
 * sources of truth for the same participant obligation.
 */
export type V3EditionState = "planning" | "active" | "completed" | "archived" | "cancelled";

export type V3WindowState = "scheduled" | "open" | "paused" | "closed" | "cancelled";

export type V3ShowState =
  | "scheduled"
  | "preparing"
  | "delayed"
  | "live"
  | "paused"
  | "ended"
  | "cancelled";

export type V3JuryState =
  | "locked"
  | "upcoming"
  | "open"
  | "paused"
  | "closed"
  | "reviewing"
  | "validated"
  | "finalized";

export type V3TelevoteState =
  | "locked"
  | "upcoming"
  | "open"
  | "paused"
  | "extended"
  | "closed"
  | "validating"
  | "validated";

export type V3ResultsState =
  | "hidden"
  | "prepared"
  | "reviewing"
  | "approved"
  | "published"
  | "corrected";

export type V3PublicationState = "draft" | "scheduled" | "public" | "withdrawn";

export type V3ContestDomainSnapshot = {
  edition: V3EditionState;
  confirmationWindow: V3WindowState | null;
  submissionWindow: V3WindowState | null;
  show: V3ShowState | null;
  jury: V3JuryState | null;
  televote: V3TelevoteState | null;
  results: V3ResultsState;
  publication: V3PublicationState | null;
};

export type V3ExperienceMode =
  | "planning"
  | "active"
  | "show-day"
  | "live"
  | "live-voting"
  | "voting"
  | "results"
  | "post-edition"
  | "archived"
  | "cancelled";

export type V3ExperienceProjection = {
  mode: V3ExperienceMode;
  live: boolean;
  votingOpen: boolean;
  resultsPublic: boolean;
};

function isVotingOpen(state: V3TelevoteState | null) {
  return state === "open" || state === "extended";
}

function isLiveShow(state: V3ShowState | null) {
  return state === "live" || state === "paused" || state === "delayed";
}

function resultsArePublic(state: V3ResultsState) {
  return state === "published" || state === "corrected";
}

/**
 * Derive the visual/interaction mode from canonical contest facts.
 *
 * Priority is deliberate: published results beat live decoration, a live show
 * beats generic active state, and voting can be open independently from show
 * state. No caller should reimplement this precedence ad hoc in Home.
 */
export function projectV3Experience(
  snapshot: V3ContestDomainSnapshot,
): V3ExperienceProjection {
  const votingOpen = isVotingOpen(snapshot.televote);
  const live = isLiveShow(snapshot.show);
  const resultsPublic = resultsArePublic(snapshot.results);

  let mode: V3ExperienceMode;

  if (snapshot.edition === "cancelled") mode = "cancelled";
  else if (snapshot.edition === "archived") mode = "archived";
  else if (resultsPublic) mode = "results";
  else if (live && votingOpen) mode = "live-voting";
  else if (live) mode = "live";
  else if (votingOpen) mode = "voting";
  else if (snapshot.show === "preparing") mode = "show-day";
  else if (snapshot.edition === "completed") mode = "post-edition";
  else if (snapshot.edition === "planning") mode = "planning";
  else mode = "active";

  return {
    mode,
    live,
    votingOpen,
    resultsPublic,
  };
}
