import { describe, expect, it } from "vitest";

import type { V3ActionProjection } from "./v3-experience";
import type { V3JourneyStepProjection } from "./v3-journey";
import { projectV3Participate } from "./v3-participate";

function action(
  id: string,
  overrides: Partial<V3ActionProjection> = {},
): V3ActionProjection {
  return {
    id,
    editionId: "22",
    kind: "jury",
    sourceState: "upcoming",
    title: id,
    description: `${id} description`,
    why: `${id} why`,
    route: `/${id}`,
    actionRequired: false,
    urgency: "none",
    impact: "low",
    deliveryClass: "recommended",
    opensAt: null,
    deadline: null,
    completed: false,
    ...overrides,
  };
}

const journey: V3JourneyStepProjection[] = [
  {
    id: "confirmation",
    responsibility: "confirmation",
    title: "Confirmation",
    detail: "Confirmed",
    state: "complete",
    route: "/confirmations",
    actionRequired: false,
    deadline: null,
  },
  {
    id: "jury",
    responsibility: "jury",
    title: "Jury",
    detail: "Open ballot",
    state: "active",
    route: "/jury-voting",
    actionRequired: true,
    deadline: "2026-10-12T18:00:00.000Z",
  },
];

describe("projectV3Participate", () => {
  it("keeps required attention, future responsibilities, optional participation and history separate", () => {
    const required = action("required-jury", {
      actionRequired: true,
      deliveryClass: "required",
      impact: "blocking",
      urgency: "high",
      sourceState: "needs_attention",
    });
    const next = action("next-entry", {
      kind: "entry",
      deliveryClass: "required",
      sourceState: "upcoming",
    });
    const optional = action("public-vote", {
      kind: "televote",
      deliveryClass: "optional",
      actionRequired: false,
      urgency: "immediate",
      sourceState: "available",
    });
    const done = action("confirmation-done", {
      kind: "confirmation",
      deliveryClass: "required",
      completed: true,
      sourceState: "completed",
    });

    const projection = projectV3Participate({
      actions: [required, next, optional, done],
      journey,
    });

    expect(projection.needsAttention.map((item) => item.id)).toEqual(["required-jury"]);
    expect(projection.next.map((item) => item.id)).toEqual(["next-entry"]);
    expect(projection.optionalNow.map((item) => item.id)).toEqual(["public-vote"]);
    expect(projection.completed.map((item) => item.id)).toEqual(["confirmation-done"]);
    expect(projection.journeyCompleteCount).toBe(1);
    expect(projection.journeyTotalCount).toBe(2);
  });

  it("projects jury and public televote into one voting overview without changing their responsibility classes", () => {
    const jury = action("jury-open", {
      kind: "jury",
      route: "/jury-voting",
      actionRequired: true,
      deliveryClass: "required",
      impact: "blocking",
      sourceState: "needs_attention",
    });
    const televote = action("televote-open", {
      kind: "televote",
      route: "/televoting",
      actionRequired: false,
      deliveryClass: "optional",
      sourceState: "available",
    });

    const projection = projectV3Participate({ actions: [jury, televote], journey: [] });

    expect(projection.voting.currentCount).toBe(2);
    expect(projection.voting.jury?.id).toBe("jury-open");
    expect(projection.voting.jury?.deliveryClass).toBe("required");
    expect(projection.voting.televote?.id).toBe("televote-open");
    expect(projection.voting.televote?.deliveryClass).toBe("optional");
    expect(projection.needsAttention.map((item) => item.id)).toEqual(["jury-open"]);
    expect(projection.optionalNow.map((item) => item.id)).toEqual(["televote-open"]);
  });

  it("prefers the current voting action over historical completion evidence", () => {
    const completedJury = action("jury-old", {
      kind: "jury",
      completed: true,
      sourceState: "completed",
      deliveryClass: "required",
    });
    const currentJury = action("jury-current", {
      kind: "jury",
      sourceState: "upcoming",
      deliveryClass: "required",
    });

    const projection = projectV3Participate({
      actions: [completedJury, currentJury],
      journey: [],
    });

    expect(projection.voting.jury?.id).toBe("jury-current");
    expect(projection.voting.currentCount).toBe(1);
  });

  it("does not invent closed or unavailable voting truth when no canonical action exists", () => {
    const projection = projectV3Participate({ actions: [], journey: [] });

    expect(projection.voting).toEqual({
      jury: null,
      televote: null,
      currentCount: 0,
    });
  });

  it("never promotes an optional action into required attention even when it is urgent", () => {
    const optionalUrgent = action("urgent-public-vote", {
      kind: "televote",
      deliveryClass: "optional",
      actionRequired: true,
      urgency: "immediate",
      impact: "high",
      sourceState: "available",
    });

    const projection = projectV3Participate({ actions: [optionalUrgent], journey: [] });

    expect(projection.needsAttention).toEqual([]);
    expect(projection.optionalNow.map((item) => item.id)).toEqual(["urgent-public-vote"]);
    expect(projection.voting.televote?.id).toBe("urgent-public-vote");
  });

  it("uses journey evidence as-is instead of inventing missing responsibilities", () => {
    const projection = projectV3Participate({ actions: [], journey });

    expect(projection.journey.map((step) => step.responsibility)).toEqual([
      "confirmation",
      "jury",
    ]);
    expect(projection.journeyTotalCount).toBe(2);
  });
});
