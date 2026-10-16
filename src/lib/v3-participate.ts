import type { V3BootstrapProjection } from "./v3-bootstrap";
import type { V3ActionProjection } from "./v3-experience";
import type { V3JourneyStepProjection } from "./v3-journey";

export type V3VotingOverviewProjection = {
  jury: V3ActionProjection | null;
  televote: V3ActionProjection | null;
  currentCount: number;
};

export type V3ParticipateProjection = {
  journey: readonly V3JourneyStepProjection[];
  journeyCompleteCount: number;
  journeyTotalCount: number;
  voting: V3VotingOverviewProjection;
  needsAttention: readonly V3ActionProjection[];
  next: readonly V3ActionProjection[];
  optionalNow: readonly V3ActionProjection[];
  completed: readonly V3ActionProjection[];
};

function isOptional(action: V3ActionProjection) {
  return action.deliveryClass === "optional";
}

function currentVotingAction(
  actions: readonly V3ActionProjection[],
  kind: "jury" | "televote",
) {
  return (
    actions.find((action) => action.kind === kind && !action.completed) ??
    actions.find((action) => action.kind === kind) ??
    null
  );
}

/**
 * Participate is a presentation projection over the exact same V3 bootstrap
 * that feeds Home. It deliberately does not create another task source or
 * infer workflow truth from routes.
 *
 * Responsibilities and optional participation remain separate. A public vote
 * may be time-sensitive, but it must never visually compete with an unfinished
 * official delegation responsibility as though both were required work.
 */
export function projectV3Participate(
  bootstrap: Pick<V3BootstrapProjection, "actions" | "journey">,
): V3ParticipateProjection {
  const needsAttention: V3ActionProjection[] = [];
  const next: V3ActionProjection[] = [];
  const optionalNow: V3ActionProjection[] = [];
  const completed: V3ActionProjection[] = [];

  for (const action of bootstrap.actions) {
    if (action.completed) {
      completed.push(action);
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

  return {
    journey: bootstrap.journey,
    journeyCompleteCount: bootstrap.journey.filter((step) => step.state === "complete").length,
    journeyTotalCount: bootstrap.journey.length,
    voting: {
      jury,
      televote,
      currentCount: Number(Boolean(jury)) + Number(Boolean(televote)),
    },
    needsAttention,
    next,
    optionalNow,
    completed,
  };
}
