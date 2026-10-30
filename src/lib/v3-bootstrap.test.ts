import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import { projectV3Bootstrap, type V3BootstrapSource } from "./v3-bootstrap";

function task(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: "jury:sf1",
    editionId: "22",
    kind: "jury",
    title: "Jury voting",
    description: "Complete the official ballot.",
    state: "needs_attention",
    importance: "required",
    blocking: true,
    actionRequired: true,
    opensAt: "2026-10-11T15:00:00.000Z",
    deadline: "2026-10-11T20:00:00.000Z",
    route: "/jury-voting",
    priority: 120,
    why: "The official jury window is open and no submission has been recorded.",
    ...overrides,
  };
}

function source(overrides: Partial<V3BootstrapSource> = {}): V3BootstrapSource {
  return {
    schemaVersion: 1,
    generatedAt: "2026-10-11T18:00:00.000Z",
    serverTime: "2026-10-11T18:00:00.000Z",
    identity: { userId: "user-1", displayName: "Arthur" },
    context: {
      editionId: "22",
      editionLabel: "SSC 22",
      delegationId: "oland",
      delegationName: "Oland",
    },
    capabilities: ["jury.vote", "entry.submit"],
    domain: {
      edition: "active",
      confirmationWindow: "closed",
      submissionWindow: "closed",
      show: "scheduled",
      jury: "open",
      televote: "upcoming",
      results: "hidden",
      publication: "scheduled",
    },
    tasks: [task()],
    ...overrides,
  };
}

describe("V3 bootstrap projection", () => {
  it("drives Home, Journey, Attention and Participate from one canonical task projection", () => {
    const bootstrap = projectV3Bootstrap(source());

    expect(bootstrap.taskProjection).toMatchObject({
      schemaVersion: 1,
      audience: "participant",
      authoritativeSource: "participant-task-engine",
    });
    expect(bootstrap.actions[0]?.id).toBe("participant:22:jury");
    expect(bootstrap.attention.primary?.id).toBe("participant:22:jury");
    expect(bootstrap.journey[0]).toMatchObject({
      id: "participant:22:jury",
      responsibility: "jury",
      state: "active",
    });
    expect(bootstrap.home.primaryMode).toBe("attention");
  });

  it("reconciles duplicate participant evidence before any V3 surface consumes it", () => {
    const bootstrap = projectV3Bootstrap(
      source({
        tasks: [
          task({ id: "jury:rpc", priority: 120 }),
          task({ id: "hod:jury", priority: 80, state: "waiting", actionRequired: false }),
        ],
      }),
    );

    expect(bootstrap.taskProjection.items).toHaveLength(1);
    expect(bootstrap.actions).toHaveLength(1);
    expect(bootstrap.journey).toHaveLength(1);
    expect(bootstrap.actions[0]?.id).toBe("participant:22:jury");
  });

  it("uses server time rather than device time for urgency", () => {
    const bootstrap = projectV3Bootstrap(
      source({ serverTime: "2026-10-11T19:30:00.000Z" }),
    );
    expect(bootstrap.actions[0]?.urgency).toBe("immediate");
  });

  it("keeps optional participation out of the responsibility journey and badge count", () => {
    const bootstrap = projectV3Bootstrap(
      source({
        tasks: [
          task({
            id: "televote:sf1",
            kind: "televote",
            title: "Public voting",
            importance: "optional",
            blocking: false,
            actionRequired: false,
            state: "available",
            route: "/televoting",
          }),
        ],
      }),
    );

    expect(bootstrap.journey).toEqual([]);
    expect(bootstrap.attention.badgeCount).toBe(0);
    expect(bootstrap.actions[0]?.deliveryClass).toBe("optional");
    expect(bootstrap.taskProjection.items[0]?.deliveryClass).toBe("optional");
  });

  it("keeps personal entry completion in canonical tasks instead of contest-domain state", () => {
    const entry = task({
      id: "entry:22",
      kind: "entry",
      title: "Entry ready",
      state: "completed",
      actionRequired: false,
      blocking: false,
      route: "/my-solaris/entry",
    });
    const bootstrap = projectV3Bootstrap(source({ tasks: [entry] }));

    expect("entry" in source().domain).toBe(false);
    expect(bootstrap.taskProjection.items[0]).toMatchObject({
      id: "participant:22:entry",
      state: "completed",
    });
    expect(bootstrap.journey[0]).toMatchObject({
      responsibility: "entry",
      state: "complete",
    });
  });

  it("applies spoiler protection once at bootstrap projection level", () => {
    const bootstrap = projectV3Bootstrap(
      source({
        domain: { ...source().domain, results: "published" },
        tasks: [],
        preferences: { hideResultSpoilers: true },
      }),
    );

    expect(bootstrap.experience.mode).toBe("results");
    expect(bootstrap.home.primaryMode).toBe("results-hidden");
    expect(bootstrap.home.showResults).toBe(false);
  });

  it("passes capabilities through without deriving permissions from display-role names", () => {
    const bootstrap = projectV3Bootstrap(
      source({ capabilities: ["confirmation.manage", "jury.vote"] }),
    );
    expect(bootstrap.capabilities).toEqual(["confirmation.manage", "jury.vote"]);
  });

  it("rejects bootstrap data without a valid server clock", () => {
    expect(() => projectV3Bootstrap(source({ serverTime: "not-a-date" }))).toThrow(
      "V3 bootstrap requires a valid serverTime timestamp.",
    );
  });
});
