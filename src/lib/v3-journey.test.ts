import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import { projectV3Journey } from "./v3-journey";

function task(overrides: Partial<SolarisTask>): SolarisTask {
  return {
    id: "confirmation:22",
    editionId: "22",
    kind: "confirmation",
    title: "Country confirmed",
    description: "Your delegation confirmation is recorded.",
    state: "completed",
    importance: "required",
    blocking: false,
    actionRequired: false,
    opensAt: null,
    deadline: null,
    route: "/confirmations",
    priority: 70,
    why: "Canonical confirmation evidence exists.",
    ...overrides,
  };
}

describe("V3 responsibility journey", () => {
  it("projects only responsibility kinds and keeps optional televote out of the journey", () => {
    const journey = projectV3Journey([
      task({}),
      task({
        id: "jury:22",
        kind: "jury",
        title: "Jury voting",
        description: "Official jury ballot is open.",
        state: "needs_attention",
        actionRequired: true,
        blocking: true,
        route: "/jury-voting",
        priority: 120,
      }),
      task({
        id: "televote:22",
        kind: "televote",
        title: "Public voting",
        description: "Optional public vote.",
        state: "available",
        importance: "optional",
        actionRequired: false,
        route: "/televoting",
        priority: 30,
      }),
    ]);

    expect(journey.map((step) => step.responsibility)).toEqual(["confirmation", "jury"]);
    expect(journey.find((step) => step.responsibility === "jury")).toMatchObject({
      state: "active",
      actionRequired: true,
    });
  });

  it("does not manufacture missing entry or media workflow states", () => {
    const journey = projectV3Journey([task({})]);

    expect(journey).toHaveLength(1);
    expect(journey[0]?.responsibility).toBe("confirmation");
    expect(journey.some((step) => step.responsibility === "entry")).toBe(false);
    expect(journey.some((step) => step.responsibility === "media")).toBe(false);
  });

  it("orders responsibility milestones consistently", () => {
    const journey = projectV3Journey([
      task({ id: "jury", kind: "jury", title: "Jury", state: "upcoming", priority: 40 }),
      task({ id: "entry", kind: "entry", title: "Entry", state: "completed", priority: 60 }),
      task({ id: "media", kind: "media", title: "Media", state: "waiting", priority: 50 }),
      task({ id: "confirmation", kind: "confirmation", title: "Confirmation", state: "completed", priority: 70 }),
    ]);

    expect(journey.map((step) => step.responsibility)).toEqual([
      "confirmation",
      "entry",
      "media",
      "jury",
    ]);
  });

  it("lets the highest-priority canonical task for one responsibility define its projected state", () => {
    const journey = projectV3Journey([
      task({
        id: "entry-complete",
        kind: "entry",
        title: "Entry ready",
        state: "completed",
        priority: 65,
      }),
      task({
        id: "entry-problem",
        kind: "entry",
        title: "Entry needs attention",
        description: "Organizer review requires a correction.",
        state: "problem",
        blocking: true,
        actionRequired: true,
        priority: 140,
      }),
    ]);

    expect(journey).toEqual([
      expect.objectContaining({
        id: "entry-problem",
        responsibility: "entry",
        state: "problem",
        actionRequired: true,
      }),
    ]);
  });
});
