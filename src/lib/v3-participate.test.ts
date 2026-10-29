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
  it("keeps required attention, blocked problems, future responsibilities, waiting work, optional participation and history separate", () => {
    const required = action("required-jury", {
      actionRequired: true,
      deliveryClass: "required",
      impact: "blocking",
      urgency: "high",
      sourceState: "needs_attention",
    });
    const blocked = action("entry-changes-locked", {
      kind: "entry",
      deliveryClass: "required",
      impact: "blocking",
      urgency: "none",
      sourceState: "problem",
      actionRequired: false,
    });
    const next = action("next-entry", {
      kind: "entry",
      deliveryClass: "required",
      sourceState: "upcoming",
    });
    const waiting = action("waiting-confirmation", {
      kind: "confirmation",
      deliveryClass: "required",
      sourceState: "waiting",
      actionRequired: false,
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
      actions: [required, blocked, next, waiting, optional, done],
      journey,
    });

    expect(projection.focus).toEqual({ state: "blocked", action: blocked });
    expect(projection.needsAttention.map((item) => item.id)).toEqual(["required-jury"]);
    expect(projection.blocked.map((item) => item.id)).toEqual(["entry-changes-locked"]);
    expect(projection.next.map((item) => item.id)).toEqual(["next-entry"]);
    expect(projection.waiting.map((item) => item.id)).toEqual(["waiting-confirmation"]);
    expect(projection.optionalNow.map((item) => item.id)).toEqual(["public-vote"]);
    expect(projection.completed.map((item) => item.id)).toEqual(["confirmation-done"]);
    expect(projection.journeyCompleteCount).toBe(1);
    expect(projection.journeyTotalCount).toBe(2);
  });

  it("keeps a non-actionable blocking problem above another editable responsibility", () => {
    const lockedChanges = action("locked-entry-correction", {
      kind: "entry",
      sourceState: "problem",
      deliveryClass: "required",
      impact: "blocking",
      actionRequired: false,
    });
    const editableChanges = action("editable-entry-correction", {
      kind: "entry",
      sourceState: "problem",
      deliveryClass: "required",
      impact: "blocking",
      actionRequired: true,
      urgency: "high",
    });

    const projection = projectV3Participate({
      actions: [lockedChanges, editableChanges],
      journey: [],
    });

    expect(projection.focus.action?.id).toBe("locked-entry-correction");
    expect(projection.focus.state).toBe("blocked");
    expect(projection.blocked.map((item) => item.id)).toEqual(["locked-entry-correction"]);
    expect(projection.needsAttention.map((item) => item.id)).toEqual(["editable-entry-correction"]);
    expect(projection.next).toEqual([]);
  });

  it("uses blocked, waiting and upcoming official states as honest focus fallbacks", () => {
    const blocked = action("blocked-entry", {
      kind: "entry",
      sourceState: "problem",
      deliveryClass: "required",
      actionRequired: false,
    });
    const waiting = action("waiting-confirmation", {
      kind: "confirmation",
      sourceState: "waiting",
      deliveryClass: "required",
    });
    const upcoming = action("upcoming-jury", {
      sourceState: "upcoming",
      deliveryClass: "required",
    });

    expect(projectV3Participate({ actions: [upcoming, waiting, blocked], journey: [] }).focus).toEqual({
      state: "blocked",
      action: blocked,
    });
    expect(projectV3Participate({ actions: [upcoming, waiting], journey: [] }).focus).toEqual({
      state: "waiting",
      action: waiting,
    });
    expect(projectV3Participate({ actions: [upcoming], journey: [] }).focus).toEqual({
      state: "upcoming",
      action: upcoming,
    });
  });

  it("keeps optional waiting actions in Waiting until canonical state becomes actionable", () => {
    const optionalWaiting = action("televote-waiting", {
      kind: "televote",
      deliveryClass: "optional",
      sourceState: "waiting",
      actionRequired: false,
      opensAt: "2026-10-22T18:00:00.000Z",
    });

    const projection = projectV3Participate({ actions: [optionalWaiting], journey: [] });

    expect(projection.waiting.map((item) => item.id)).toEqual(["televote-waiting"]);
    expect(projection.optionalNow).toEqual([]);
    expect(projection.next).toEqual([]);
    expect(projection.focus).toEqual({ state: "clear", action: null });
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

  it("keeps completed voting cards as context without counting them as current", () => {
    const completedJury = action("jury-submitted", {
      kind: "jury",
      completed: true,
      sourceState: "completed",
      deliveryClass: "required",
    });
    const finishedTelevote = action("televote-finished", {
      kind: "televote",
      completed: true,
      sourceState: "finished",
      deliveryClass: "optional",
    });

    const projection = projectV3Participate({
      actions: [completedJury, finishedTelevote],
      journey: [],
    });

    expect(projection.voting.jury?.id).toBe("jury-submitted");
    expect(projection.voting.televote?.id).toBe("televote-finished");
    expect(projection.voting.currentCount).toBe(0);
    expect(projection.focus).toEqual({ state: "clear", action: null });
  });

  it("does not invent closed or unavailable voting truth when no canonical action exists", () => {
    const projection = projectV3Participate({ actions: [], journey: [] });

    expect(projection.voting).toEqual({
      jury: null,
      televote: null,
      currentCount: 0,
    });
    expect(projection.focus).toEqual({ state: "clear", action: null });
  });

  it("never promotes an optional action into required focus even when it is urgent", () => {
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
    expect(projection.focus).toEqual({ state: "clear", action: null });
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
