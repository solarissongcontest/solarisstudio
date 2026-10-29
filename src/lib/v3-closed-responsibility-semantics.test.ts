import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import { projectV3Action } from "./v3-experience";
import { projectV3Participate } from "./v3-participate";

function task(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: "jury:final",
    editionId: "22",
    kind: "jury",
    title: "Grand Final jury",
    description: "The voting window closed without a recorded submission.",
    state: "problem",
    importance: "required",
    blocking: true,
    actionRequired: true,
    opensAt: "2026-10-20T18:00:00.000Z",
    deadline: "2026-10-20T20:00:00.000Z",
    route: "/jury-voting",
    priority: 150,
    why: "The official voting window is closed and Solaris has no recorded submission.",
    ...overrides,
  };
}

describe("V3 closed responsibility semantics", () => {
  it("keeps a missed closed required vote blocking but removes fake browser action affordance", () => {
    const action = projectV3Action(task(), Date.parse("2026-10-20T21:00:00.000Z"));

    expect(action).toMatchObject({
      kind: "jury",
      sourceState: "problem",
      actionRequired: false,
      urgency: "none",
      impact: "blocking",
      completed: false,
    });

    const participate = projectV3Participate({ actions: [action], journey: [] });
    expect(participate.focus).toEqual({ state: "blocked", action });
    expect(participate.blocked).toEqual([action]);
    expect(participate.needsAttention).toEqual([]);
    expect(participate.voting.currentCount).toBe(0);
  });

  it("keeps an ended optional voting window in Closed rather than Completed", () => {
    const action = projectV3Action(
      task({
        id: "televote:final",
        kind: "televote",
        title: "Grand Final public voting",
        description: "This voting window has closed.",
        state: "finished",
        importance: "optional",
        blocking: false,
        actionRequired: false,
        priority: 40,
        route: "/televoting",
        why: "This optional voting window has closed.",
      }),
      Date.parse("2026-10-20T21:00:00.000Z"),
    );

    expect(action.completed).toBe(false);

    const participate = projectV3Participate({ actions: [action], journey: [] });
    expect(participate.closed).toEqual([action]);
    expect(participate.completed).toEqual([]);
    expect(participate.optionalNow).toEqual([]);
    expect(participate.voting.televote).toEqual(action);
    expect(participate.voting.currentCount).toBe(0);
  });
});
