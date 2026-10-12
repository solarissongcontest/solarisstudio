import { describe, expect, it } from "vitest";

import type { V3BootstrapProjection } from "./v3-bootstrap";
import type { V3ActionProjection } from "./v3-experience";
import { resolveV3ActionLink } from "./v3-action-link";

function action(overrides: Partial<V3ActionProjection> = {}): V3ActionProjection {
  return {
    id: "jury:ssc22-sf1",
    editionId: "22",
    kind: "jury",
    sourceState: "needs_attention",
    title: "Jury voting",
    description: "Complete your official ballot.",
    why: "A required jury ballot is open.",
    route: "/jury-voting",
    actionRequired: true,
    urgency: "high",
    impact: "blocking",
    deliveryClass: "required",
    opensAt: "2026-10-11T18:00:00.000Z",
    deadline: "2026-10-11T20:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

function bootstrap(actions: V3ActionProjection[], editionId: string | null = "22") {
  return {
    actions,
    context: {
      editionId,
      editionLabel: editionId ? `SSC ${editionId}` : null,
      delegationId: "oland",
      delegationName: "Oland",
    },
  } as Pick<V3BootstrapProjection, "actions" | "context">;
}

describe("resolveV3ActionLink", () => {
  it("uses the canonical current route for an actionable deep link", () => {
    const current = action({ route: "/jury-voting/current" });

    expect(
      resolveV3ActionLink(bootstrap([current]), {
        actionId: current.id,
        source: "push",
        editionId: "22",
      }),
    ).toMatchObject({
      status: "actionable",
      route: "/jury-voting/current",
      message: null,
    });
  });

  it("turns an old notification into a completed state instead of reopening work", () => {
    const current = action({
      sourceState: "completed",
      actionRequired: false,
      completed: true,
      urgency: "none",
      impact: "high",
    });

    expect(
      resolveV3ActionLink(bootstrap([current]), {
        actionId: current.id,
        source: "notification",
        editionId: "22",
      }),
    ).toMatchObject({
      status: "completed",
      route: "/jury-voting",
      message: "This action is already complete.",
    });
  });

  it("does not present a waiting confirmation as actionable", () => {
    const current = action({
      id: "confirmation-waiting:req-1",
      kind: "confirmation",
      sourceState: "waiting",
      actionRequired: false,
      urgency: "none",
      impact: "high",
      route: "/confirmations",
    });

    expect(
      resolveV3ActionLink(bootstrap([current]), {
        actionId: current.id,
        source: "home",
        editionId: "22",
      }),
    ).toMatchObject({
      status: "waiting",
      route: "/confirmations",
    });
  });

  it("keeps a closed optional vote closed even when an old push is opened", () => {
    const current = action({
      id: "televote:ssc22-sf1",
      kind: "televote",
      sourceState: "finished",
      actionRequired: false,
      completed: true,
      urgency: "none",
      impact: "low",
      deliveryClass: "optional",
      route: "/televoting",
    });

    const result = resolveV3ActionLink(bootstrap([current]), {
      actionId: current.id,
      source: "push",
      editionId: "22",
    });

    // Completed server evidence outranks generic finished-window messaging.
    expect(result.status).toBe("completed");
  });

  it("classifies a finished non-completed optional window as closed", () => {
    const current = action({
      id: "televote:ssc22-sf1",
      kind: "televote",
      sourceState: "finished",
      actionRequired: false,
      completed: false,
      urgency: "none",
      impact: "low",
      deliveryClass: "optional",
      route: "/televoting",
    });

    expect(
      resolveV3ActionLink(bootstrap([current]), {
        actionId: current.id,
        source: "push",
        editionId: "22",
      }),
    ).toMatchObject({ status: "closed", route: "/televoting" });
  });

  it("preserves problem state instead of pretending a closed required task can still submit", () => {
    const current = action({
      sourceState: "problem",
      actionRequired: true,
      urgency: "immediate",
      impact: "blocking",
    });

    expect(
      resolveV3ActionLink(bootstrap([current]), {
        actionId: current.id,
        source: "push",
        editionId: "22",
      }),
    ).toMatchObject({
      status: "problem",
      route: "/jury-voting",
    });
  });

  it("falls back to Participate when the referenced action no longer exists", () => {
    expect(
      resolveV3ActionLink(bootstrap([]), {
        actionId: "jury:old-round",
        source: "push",
        editionId: "22",
      }),
    ).toEqual({
      status: "stale",
      route: "/participate",
      action: null,
      message: "This action is no longer active. Your current participation status is shown here.",
    });
  });

  it("refuses to silently open an action in the wrong edition context", () => {
    const current = action({ editionId: "21" });

    expect(
      resolveV3ActionLink(bootstrap([current], "22"), {
        actionId: current.id,
        source: "external",
      }),
    ).toMatchObject({
      status: "context-mismatch",
      route: "/participate",
      targetEditionId: "21",
    });
  });

  it("also rejects a request whose explicit edition disagrees with the canonical action", () => {
    const current = action({ editionId: "22" });

    expect(
      resolveV3ActionLink(bootstrap([current], "22"), {
        actionId: current.id,
        source: "notification",
        editionId: "21",
      }),
    ).toMatchObject({
      status: "context-mismatch",
      targetEditionId: "22",
    });
  });
});
