import type { V3BootstrapProjection } from "./v3-bootstrap";
import type { V3ActionProjection } from "./v3-experience";
import type { V3JourneyStepProjection } from "./v3-journey";

export type V3VotingOverviewProjection = {
  jury: V3ActionProjection | null;
  televote: V3ActionProjection | null;
  currentCount: number;
};

export type V3ParticipateFocusState =
  | "actionable"
  | "blocked"
  | "waiting"
  | "upcoming"
  | "clear";

export type V3ParticipateFocusProjection = {
  state: V3ParticipateFocusState;
  action: V3ActionProjection | null;
};

export type V3ParticipateProjection = {
  focus: V3ParticipateFocusProjection;
  journey: readonly V3JourneyStepProjection[];
  journeyCompleteCount: number;
  journeyTotalCount: number;
  voting: V3VotingOverviewProjection;
  needsAttention: readonly V3ActionProjection[];
  blocked: readonly V3ActionProjection[];
  next: readonly V3ActionProjection[];
  waiting: readonly V3ActionProjection[];
  optionalNow: readonly V3ActionProjection[];
  closed: readonly V3ActionProjection[];
  completed: readonly V3ActionProjection[];
};

function isOptional(action: V3ActionProjection) {
  return action.deliveryClass === "optional";
}

function firstOfficial(actions: readonly V3ActionProjection[]) {
  return actions.find((action) => !isOptional(action)) ?? null;
}

function votingIsCurrent(action: V3ActionProjection | null) {
  if (!action) return false;
  if (action.completed) return false;
  if (action.sourceState === "finished") return false;
  // The canonical Participation OS currently uses a voting `problem` only for
  // a required voting window that closed without a recorded submission. It is
  // still important context, but it is no longer a current voting action.
  if (action.sourceState === "problem") return false;
  return true;
}

function currentVotingAction(
  actions: readonly V3ActionProjection[],
  kind: "jury" | "televote",
) {
  return (
    actions.find((action) => action.kind === kind && votingIsCurrent(action)) ??
    actions.find((action) => action.kind === kind) ??
    null
  );
}

function projectFocus(input: {
  needsAttention: readonly V3ActionProjection[];
  blocked: readonly V3ActionProjection[];
  waiting: readonly V3ActionProjection[];
  next: readonly V3ActionProjection[];
}): V3ParticipateFocusProjection {
  // Canonical Participate ordering is deliberately blocker-first. A blocked
  // official responsibility can prevent the delegation from progressing even
  // when some other action is technically available, so it must not be hidden
  // behind an actionable card. The screen still explains that no action is
  // currently available for the blocker instead of manufacturing one.
  const blocked = firstOfficial(input.blocked);
  if (blocked) return { state: "blocked", action: blocked };

  const actionable = firstOfficial(input.needsAttention);
  if (actionable) return { state: "actionable", action: actionable };

  const waiting = firstOfficial(input.waiting);
  if (waiting) return { state: "waiting", action: waiting };

  const upcoming = firstOfficial(input.next);
  if (upcoming) return { state: "upcoming", action: upcoming };

  return { state: "clear", action: null };
}

/**
 * Participate is a presentation projection over the exact same V3 bootstrap
 * that feeds Home. It deliberately does not create another task source or
 * infer workflow truth from routes.
 *
 * Responsibilities, blocked/waiting/closed state and optional participation
 * remain separate. A canonical problem that the viewer cannot currently act on
 * is blocked, not their "Next" task. A public vote may be time-sensitive, but
 * it must never visually compete with an unfinished official delegation
 * responsibility as though both were required work. Likewise, a canonical
 * waiting action must not be presented as the viewer's next/optional action
 * until server-owned workflow state makes it actionable. A finished optional
 * window is history, not successful completion.
 *
 * The focus projection is intentionally deterministic over those canonical
 * buckets. Canonical blocked required work outranks actionable required work,
 * followed by waiting and upcoming responsibility. It never compares the
 * browser clock, manufactures a deadline state or promotes optional fan
 * participation into an official responsibility.
 */
export function projectV3Participate(
  bootstrap: Pick<V3BootstrapProjection, "actions" | "journey">,
): V3ParticipateProjection {
  const needsAttention: V3ActionProjection[] = [];
  const blocked: V3ActionProjection[] = [];
  const next: V3ActionProjection[] = [];
  const waiting: V3ActionProjection[] = [];
  const optionalNow: V3ActionProjection[] = [];
  const closed: V3ActionProjection[] = [];
  const completed: V3ActionProjection[] = [];

  for (const action of bootstrap.actions) {
    // `finished` means the opportunity/window ended. The shared V3 action
    // projection historically marks it completed for generic historical UI,
    // but Participate must keep "window closed" distinct from "I completed
    // this responsibility".
    if (action.sourceState === "finished") {
      closed.push(action);
      continue;
    }

    if (action.completed) {
      completed.push(action);
      continue;
    }

    // A server-owned problem with no current participant action is blocked.
    // Current Jury/Televote `problem` state specifically means a required
    // voting window closed without a recorded submission. It remains blocked
    // even if an older generic task flag still says actionRequired: there is no
    // browser action that can reopen the canonical voting window.
    if (
      action.sourceState === "problem" &&
      (!action.actionRequired || action.kind === "jury" || action.kind === "televote")
    ) {
      blocked.push(action);
      continue;
    }

    // Server-owned waiting truth outranks presentation class. This includes an
    // optional action whose window has not opened yet: it is optional, but it is
    // not "Optional now" until the canonical action state says it is available.
    if (action.sourceState === "waiting") {
      waiting.push(action);
      continue;
    }

    if (isOptional(action)) {
      optionalNow.push(action);
      continue;
    }

    if (action.actionRequired) {
      needsAttention.push(action);
      continue;
    }

    next.push(action);
  }

  const jury = currentVotingAction(bootstrap.actions, "jury");
  const televote = currentVotingAction(bootstrap.actions, "televote");
  const focus = projectFocus({ needsAttention, blocked, waiting, next });

  return {
    focus,
    journey: bootstrap.journey,
    journeyCompleteCount: bootstrap.journey.filter((step) => step.state === "complete").length,
    journeyTotalCount: bootstrap.journey.length,
    voting: {
      jury,
      televote,
      currentCount:
        Number(votingIsCurrent(jury)) +
        Number(votingIsCurrent(televote)),
    },
    needsAttention,
    blocked,
    next,
    waiting,
    optionalNow,
    closed,
    completed,
  };
}
