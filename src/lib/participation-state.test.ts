import { describe, expect, it } from "vitest";

import {
  primaryParticipationAction,
  sortParticipationActions,
  upcomingParticipationActions,
  type ParticipationAction,
} from "./participation-state";

const actions: ParticipationAction[] = [
  {
    id: "jury",
    status: "available",
    title: "Jury voting",
    description: "Open",
    to: "/jury-voting",
    priority: 20,
  },
  {
    id: "confirmations",
    status: "available",
    title: "Confirmations",
    description: "Open",
    to: "/confirmations",
    priority: 10,
  },
  {
    id: "televoting",
    status: "upcoming",
    title: "Televoting",
    description: "Soon",
    to: "/televoting",
    priority: 10,
    opensAt: "2026-09-25T18:00:00Z",
  },
];

describe("participation state", () => {
  it("puts available actions before upcoming and inactive actions", () => {
    expect(sortParticipationActions(actions).map((action) => action.id)).toEqual([
      "confirmations",
      "jury",
      "televoting",
    ]);
  });

  it("selects the highest-priority available action", () => {
    expect(primaryParticipationAction(actions)?.id).toBe("confirmations");
  });

  it("keeps upcoming work separate from current work", () => {
    expect(upcomingParticipationActions(actions).map((action) => action.id)).toEqual([
      "televoting",
    ]);
  });
});
