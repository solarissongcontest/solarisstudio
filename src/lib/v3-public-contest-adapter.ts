import type { PublicContestPhase, PublicContestState } from "./current-contest-state";
import type {
  V3ContestDomainSnapshot,
  V3EditionState,
  V3JuryState,
  V3PublicationState,
  V3ResultsState,
  V3ShowState,
  V3TelevoteState,
  V3WindowState,
} from "./v3-domain-state";

/**
 * Transitional adapter for V3 rollout.
 *
 * The existing public contest resolver is already used by production Home and
 * therefore lets V3 reuse current queries instead of creating another archive
 * fetch path. Its phase is still a collapsed public presentation state, so this
 * adapter must not become the long-term canonical contest-state engine.
 * Overlapping states, such as live show + open televote, need the orthogonal
 * runtime/subsystem source before V3 production cutover.
 */

function editionState(state: PublicContestState): V3EditionState {
  if (!state.edition || state.phase === "between_editions") return "planning";
  if (state.lifecycle === "archived") return "archived";
  if (state.lifecycle === "post_edition") return "completed";
  if (
    state.lifecycle === "draft" ||
    state.lifecycle === "planning" ||
    state.lifecycle === "host_selection"
  ) {
    return "planning";
  }
  return "active";
}

function confirmationWindow(phase: PublicContestPhase): V3WindowState | null {
  if (phase === "between_editions") return null;
  if (phase === "announced") return "scheduled";
  if (phase === "confirmations") return "open";
  return "closed";
}

function submissionWindow(phase: PublicContestPhase): V3WindowState | null {
  if (phase === "between_editions") return null;
  if (phase === "announced" || phase === "confirmations") return "scheduled";
  if (phase === "submissions") return "open";
  return "closed";
}

function showState(phase: PublicContestPhase): V3ShowState | null {
  if (phase === "pre_show" || phase === "jury_voting") return "scheduled";
  if (phase === "live") return "live";
  if (
    phase === "voting" ||
    phase === "results_pending" ||
    phase === "results_published" ||
    phase === "post_edition"
  ) {
    return "ended";
  }
  return null;
}

function juryState(phase: PublicContestPhase): V3JuryState | null {
  if (phase === "between_editions") return null;
  if (
    phase === "announced" ||
    phase === "confirmations" ||
    phase === "submissions" ||
    phase === "pre_show"
  ) {
    return "upcoming";
  }
  if (phase === "jury_voting") return "open";
  if (phase === "results_published" || phase === "post_edition") return "finalized";
  return "closed";
}

function televoteState(phase: PublicContestPhase): V3TelevoteState | null {
  if (phase === "between_editions") return null;
  if (
    phase === "announced" ||
    phase === "confirmations" ||
    phase === "submissions" ||
    phase === "pre_show" ||
    phase === "jury_voting" ||
    phase === "live"
  ) {
    return "upcoming";
  }
  if (phase === "voting") return "open";
  if (phase === "results_pending") return "validating";
  return "validated";
}

function resultsState(phase: PublicContestPhase): V3ResultsState {
  if (phase === "results_pending") return "reviewing";
  if (phase === "results_published" || phase === "post_edition") return "published";
  return "hidden";
}

function publicationState(state: PublicContestState): V3PublicationState | null {
  if (!state.edition) return null;
  if (state.phase === "results_published" || state.phase === "post_edition") return "public";
  return "scheduled";
}

export function v3ContestDomainFromPublicState(
  state: PublicContestState,
): V3ContestDomainSnapshot {
  return {
    edition: editionState(state),
    confirmationWindow: confirmationWindow(state.phase),
    submissionWindow: submissionWindow(state.phase),
    show: showState(state.phase),
    jury: juryState(state.phase),
    televote: televoteState(state.phase),
    results: resultsState(state.phase),
    publication: publicationState(state),
  };
}
