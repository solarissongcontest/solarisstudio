import { describe, expect, it } from "vitest";

import type { V3ActionProjection } from "./v3-experience";
import { projectV3Participate } from "./v3-participate";

function action(
  id: string,
  overrides: Partial<V3ActionProjection> = {},
): V3ActionProjection {
  return {
    id,
    editionId: "22",
    kind: "entry",
    sourceState: "upcoming",
    title: id,
    description: `${id} description`,
    why: `${id} why`,
    route: `/${id}`,
    actionRequired: false,
    urgency: "none",
    impact: "low",
    deliveryClass: "required",
    opensAt: null,
    deadline: null,
    completed: false,
    ...overrides,
  };
}

describe("V3 Participate blocker-first canonical priority", () => {
  it("keeps a blocked required responsibility above a different actionable responsibility", () => {
    const blockedEntry = action("entry-correction-locked", {
      kind: "entry",
      sourceState: "problem",
      impact: "blocking",
      actionRequired: false,
    });
    const urgentJury = action("jury-open", {
      kind: "jury",
      sourceState: "needs_attention",
      urgency: "immediate",
      impact: "blocking",
      actionRequired: true,
    });

    const projection = projectV3Participate({
      actions: [urgentJury, blockedEntry],
      journey: [],
    });

    expect(projection.focus).toEqual({ state: "blocked", action: blockedEntry });
    expect(projection.blocked.map((item) => item.id)).toEqual(["entry-correction-locked"]);
    expect(projection.needsAttention.map((item) => item.id)).toEqual(["jury-open"]);
  });

  it("falls through from blockers to actionable, waiting and upcoming official work", () => {
    const actionable = action("confirmation-open", {
      kind: "confirmation",
      sourceState: "available",
      actionRequired: true,
    });
    const waiting = action("jury-waiting", {
      kind: "jury",
      sourceState: "waiting",
    });
    const upcoming = action("entry-upcoming", {
      kind: "entry",
      sourceState: "upcoming",
    });

    expect(projectV3Participate({ actions: [upcoming, waiting, actionable], journey: [] }).focus)
      .toEqual({ state: "actionable", action: actionable });
    expect(projectV3Participate({ actions: [upcoming, waiting], journey: [] }).focus)
      .toEqual({ state: "waiting", action: waiting });
    expect(projectV3Participate({ actions: [upcoming], journey: [] }).focus)
      .toEqual({ state: "upcoming", action: upcoming });
  });

  it("never promotes urgent optional fan participation above official responsibility", () => {
    const optionalTelevote = action("televote-open", {
      kind: "televote",
      sourceState: "available",
      deliveryClass: "optional",
      urgency: "immediate",
      actionRequired: true,
    });
    const upcomingOfficial = action("entry-upcoming", {
      kind: "entry",
      sourceState: "upcoming",
      deliveryClass: "required",
    });

    const projection = projectV3Participate({
      actions: [optionalTelevote, upcomingOfficial],
      journey: [],
    });

    expect(projection.focus).toEqual({ state: "upcoming", action: upcomingOfficial });
    expect(projection.optionalNow.map((item) => item.id)).toEqual(["televote-open"]);
  });
});
