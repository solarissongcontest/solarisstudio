import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import {
  projectV3Action,
  projectV3Actions,
  projectV3Attention,
  v3DeliveryClass,
  v3Impact,
  v3Urgency,
} from "./v3-experience";

const NOW = Date.parse("2026-10-11T18:00:00.000Z");

function task(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: "jury:sf1",
    editionId: "22",
    kind: "jury",
    title: "Jury voting",
    description: "Submit the official Semi-final 1 ballot.",
    state: "needs_attention",
    importance: "required",
    blocking: true,
    actionRequired: true,
    opensAt: "2026-10-10T18:00:00.000Z",
    deadline: "2026-10-11T20:00:00.000Z",
    route: "/jury-voting",
    priority: 100,
    why: "The delegation has an open required jury ballot.",
    ...overrides,
  };
}

describe("V3 experience projections", () => {
  it("keeps urgency separate from whether an action is required", () => {
    expect(v3Urgency(task(), NOW)).toBe("high");
    expect(
      v3Urgency(
        task({
          id: "televote:sf1",
          kind: "televote",
          importance: "optional",
          blocking: false,
          actionRequired: false,
          deadline: "2026-10-11T18:30:00.000Z",
        }),
        NOW,
      ),
    ).toBe("none");
  });

  it("keeps delivery class separate from impact", () => {
    expect(v3DeliveryClass("required")).toBe("required");
    expect(v3DeliveryClass("recommended")).toBe("recommended");
    expect(v3DeliveryClass("optional")).toBe("optional");
    expect(v3DeliveryClass("informational")).toBe("optional");

    expect(v3Impact(task())).toBe("blocking");
    expect(v3Impact(task({ blocking: false, importance: "recommended" }))).toBe("medium");
  });

  it("projects existing Solaris tasks without creating a second source of truth", () => {
    const source = task({ priority: 120 });
    const projection = projectV3Action(source, NOW);

    expect(projection.id).toBe(source.id);
    expect(projection.sourceState).toBe(source.state);
    expect(projection.route).toBe(source.route);
    expect(projection.actionRequired).toBe(true);
    expect(projection.completed).toBe(false);
    expect(projection.urgency).toBe("high");
    expect(projection.impact).toBe("blocking");
  });

  it("preserves the legacy deterministic task ordering before V3 presentation", () => {
    const actions = projectV3Actions(
      [
        task({ id: "upcoming", state: "upcoming", actionRequired: false, blocking: false }),
        task({ id: "problem", state: "problem", blocking: false, deadline: null }),
        task({ id: "required", state: "needs_attention" }),
      ],
      NOW,
    );

    expect(actions.map((action) => action.id)).toEqual(["problem", "required", "upcoming"]);
  });

  it("enforces the Home content budget and excludes optional non-actions from badges", () => {
    const actions = [
      projectV3Action(task({ id: "a", deadline: "2026-10-11T18:30:00.000Z" }), NOW),
      projectV3Action(task({ id: "b", blocking: false, deadline: "2026-10-11T19:30:00.000Z" }), NOW),
      projectV3Action(task({ id: "c", blocking: false, deadline: "2026-10-12T12:00:00.000Z" }), NOW),
      projectV3Action(task({ id: "d", blocking: false, deadline: "2026-10-13T12:00:00.000Z" }), NOW),
      projectV3Action(
        task({
          id: "optional",
          kind: "televote",
          importance: "optional",
          blocking: false,
          actionRequired: false,
          deadline: "2026-10-11T18:15:00.000Z",
        }),
        NOW,
      ),
    ];

    const attention = projectV3Attention(actions);

    expect(attention.primary?.id).toBe("a");
    expect(attention.secondary).toHaveLength(2);
    expect(attention.remainingCount).toBe(1);
    expect(attention.badgeCount).toBe(4);
    expect(attention.immediateCount).toBe(1);
    expect(attention.hasBlockingAction).toBe(true);
  });

  it("does not surface completed required work as active attention", () => {
    const completed = projectV3Action(
      task({
        id: "done",
        state: "completed",
        actionRequired: false,
        blocking: false,
      }),
      NOW,
    );

    expect(projectV3Attention([completed])).toEqual({
      primary: null,
      secondary: [],
      remainingCount: 0,
      badgeCount: 0,
      immediateCount: 0,
      hasBlockingAction: false,
    });
  });
});
