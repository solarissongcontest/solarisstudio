/**
 * V3 domain-state vocabulary.
 *
 * These domains are intentionally orthogonal. Solaris workflows overlap in
 * reality, so V3 must never collapse the contest into one giant linear phase
 * enum. Persisted/domain state remains authoritative elsewhere; this module
 * only defines the client-facing contract and derives presentation mode.
 */
export type V3EditionState = "planning" | "active" | "completed" | "archived" | "cancelled";

export type V3ConfirmationState = "scheduled" | "open" | "closed" | "completed" | "cancelled";

export type V3EntryState =
  | "unavailable"
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_required"
  | "verified"
  | "withdrawn";

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
  | "closed"
  | "reviewing"
  | "validated"
  | "finalized";

export type V3TelevoteState =
  | "locked"
  | "upcoming"
  | "open"
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

export type V3DomainSnapshot = {
  edition: V3EditionState;
  confirmation: V3ConfirmationState | null;
  entry: V3EntryState | null;
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
 * Derive the visual/interaction mode from canonical domain facts.
 *
 * Priority is deliberate: published results beat live decoration, a live show
 * beats generic active state, and voting can be open independently from show
 * state. No caller should reimplement this precedence ad hoc in Home.
 */
export function projectV3Experience(snapshot: V3DomainSnapshot): V3ExperienceProjection {
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
