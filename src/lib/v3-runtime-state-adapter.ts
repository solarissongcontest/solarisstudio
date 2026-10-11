import {
  EDITION_STATES,
  type EditionRuntimeState,
  type EditionState,
  type SubsystemState,
} from "./edition-state";
import type {
  V3ContestDomainSnapshot,
  V3EditionState,
  V3JuryState,
  V3ResultsState,
  V3ShowState,
  V3TelevoteState,
  V3WindowState,
} from "./v3-domain-state";

function editionIndex(state: EditionState) {
  return EDITION_STATES.indexOf(state);
}

function v3EditionState(state: EditionState): V3EditionState {
  if (state === "archived") return "archived";
  if (state === "post_edition") return "completed";
  if (state === "draft" || state === "planning" || state === "host_selection") {
    return "planning";
  }
  return "active";
}

function windowFromSubsystem(state: SubsystemState): V3WindowState {
  if (state === "open") return "open";
  if (state === "paused") return "paused";
  if (state === "not_started") return "scheduled";
  return "closed";
}

function juryFromSubsystem(
  state: SubsystemState,
  edition: EditionState,
): V3JuryState {
  if (state === "open") return "open";
  if (state === "paused") return "paused";
  if (state === "verified") return "validated";
  if (state === "published") return "finalized";
  if (state === "locked") {
    return editionIndex(edition) < editionIndex("jury_voting") ? "locked" : "closed";
  }
  if (state === "closed") return "closed";
  return editionIndex(edition) < editionIndex("jury_voting") ? "upcoming" : "closed";
}

function televoteFromSubsystem(
  state: SubsystemState,
  edition: EditionState,
): V3TelevoteState {
  if (state === "open") return "open";
  if (state === "paused") return "paused";
  if (state === "verified" || state === "published") return "validated";
  if (state === "locked") {
    return editionIndex(edition) < editionIndex("televoting") ? "locked" : "closed";
  }
  if (state === "closed") return "closed";
  return editionIndex(edition) < editionIndex("televoting") ? "upcoming" : "closed";
}

function resultsFromSubsystem(state: SubsystemState): V3ResultsState {
  if (state === "published") return "published";
  if (state === "verified") return "approved";
  if (state === "open" || state === "paused") return "reviewing";
  if (state === "closed" || state === "locked") return "prepared";
  return "hidden";
}

export type V3RuntimeAdapterInput = {
  runtime: EditionRuntimeState;
  /** Exact show state comes from the show/live system, not edition phase inference. */
  show: V3ShowState | null;
};

/**
 * Preferred V3 contest-domain adapter for existing Studio state.
 *
 * EditionRuntimeState already separates confirmation, submission, jury,
 * televote and results subsystems. Reusing it preserves that orthogonality and
 * avoids V3 rebuilding contest truth from page-level presentation state.
 */
export function v3ContestDomainFromRuntime({
  runtime,
  show,
}: V3RuntimeAdapterInput): V3ContestDomainSnapshot {
  const results = resultsFromSubsystem(runtime.subsystems.results);

  return {
    edition: v3EditionState(runtime.edition),
    confirmationWindow: windowFromSubsystem(runtime.subsystems.confirmations),
    submissionWindow: windowFromSubsystem(runtime.subsystems.submissions),
    show,
    jury: juryFromSubsystem(runtime.subsystems.juryVoting, runtime.edition),
    televote: televoteFromSubsystem(runtime.subsystems.televoting, runtime.edition),
    results,
    publication: results === "published" ? "public" : "scheduled",
  };
}
