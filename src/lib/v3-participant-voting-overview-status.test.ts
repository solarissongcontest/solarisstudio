import { describe, expect, it } from "vitest";

import type { V3ActionProjection } from "./v3-experience";
import { projectV3Participate } from "./v3-participate";

function voting(
  id: string,
  kind: "jury" | "televote",
  overrides: Partial<V3ActionProjection> = {},
): V3ActionProjection {
  return {
    id,
    editionId: "22",
    kind,
    sourceState: "upcoming",
    title: id,
    description: id,
    why: id,
    route: kind === "jury" ? "/jury-voting" : "/televoting",
    actionRequired: false,
    urgency: "none",
    impact: "low",
    deliveryClass: kind === "jury" ? "required" : "optional",
    opensAt: null,
    deadline: null,
    completed: false,
    ...overrides,
  };
}

describe("V3 participant voting overview projection", () => {
  it("prefers current canonical voting state over historical completion evidence", () => {
    const oldJury = voting("old-jury", "jury", { sourceState: "completed", completed: true });
    const currentJury = voting("current-jury", "jury", { sourceState: "upcoming" });
    const oldTelevote = voting("old-televote", "televote", { sourceState: "finished", completed: true });
    const currentTelevote = voting("current-televote", "televote", { sourceState: "available" });

    const projection = projectV3Participate({
      actions: [oldJury, currentJury, oldTelevote, currentTelevote],
      journey: [],
    });

    expect(projection.voting.jury?.id).toBe("current-jury");
    expect(projection.voting.televote?.id).toBe("current-televote");
    expect(projection.voting.currentCount).toBe(2);
  });
});
