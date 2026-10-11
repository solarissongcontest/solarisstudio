import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import type { V3DomainSnapshot } from "./v3-domain-state";
import {
  buildV3AppBootstrap,
  buildV3CurrentContest,
  buildV3ExperienceProjections,
  projectV3Journey,
} from "./v3-context-projections";

const NOW = Date.parse("2026-10-11T18:00:00.000Z");

function task(
  overrides: Partial<SolarisTask> & Pick<SolarisTask, "id" | "kind">,
): SolarisTask {
  return {
    id: overrides.id,
    editionId: "ssc22",
    kind: overrides.kind,
    title: overrides.title ?? overrides.id,
    description: overrides.description ?? "Task description",
    state: overrides.state ?? "upcoming",
    importance: overrides.importance ?? "required",
    blocking: overrides.blocking ?? false,
    actionRequired: overrides.actionRequired ?? false,
    opensAt: overrides.opensAt ?? null,
    deadline: overrides.deadline ?? null,
    route: overrides.route ?? "/participate",
    priority: overrides.priority ?? 50,
    why:
      overrides.why ?? "Canonical task state requires this projection.",
  };
}

function domains(overrides: Partial<V3DomainSnapshot> = {}): V3DomainSnapshot {
  return {
    edition: "active",
    confirmation: null,
    entry: null,
    show: null,
    jury: null,
    televote: null,
    results: "hidden",
    publication: null,
    ...overrides,
  };
}

describe("Solaris Studio V3 context projections", () => {
  it("builds the stable responsibility journey and keeps optional participation separate", () => {
    const journey = projectV3Journey(
      [
        task({ id: "jury:done", kind: "jury", state: "completed" }),
        task({ id: "entry:done", kind: "entry", state: "completed" }),
        task({
          id: "confirmation:done",
          kind: "confirmation",
          state: "completed",
        }),
        task({
          id: "media:active",
          kind: "media",
          state: "needs_attention",
          actionRequired: true,
        }),
        task({
          id: "televote:open",
          kind: "televote",
          state: "available",
          importance: "optional",
        }),
        task({
          id: "results:not-a-step",
          kind: "info",
          state: "available",
          importance: "informational",
        }),
      ],
      { editionId: "ssc22", now: NOW },
    );

    expect(journey.responsibilities.map((item) => item.kind)).toEqual([
      "confirmation",
      "entry",
      "media",
      "jury",
    ]);
    expect(
      journey.responsibilities.some(
        (item) => item.actionId === "results:not-a-step",
      ),
    ).toBe(false);
    expect(journey.optionalParticipation.map((item) => item.kind)).toEqual([
      "televote",
    ]);
  });

  it("prefers an actionable/problem task when legacy task sources overlap", () => {
    const journey = projectV3Journey([
      task({ id: "entry:complete", kind: "entry", state: "completed" }),
      task({
        id: "entry:problem",
        kind: "entry",
        state: "problem",
        blocking: true,
        actionRequired: true,
      }),
    ]);

    expect(journey.responsibilities).toHaveLength(1);
    expect(journey.responsibilities[0]?.actionId).toBe("entry:problem");
    expect(journey.responsibilities[0]?.state).toBe("problem");
  });

  it("reuses the parent domain-state projection for CurrentContest", () => {
    const liveVoting = buildV3CurrentContest({
      edition: { id: "ssc22", label: "SSC 22" },
      domains: domains({ show: "live", televote: "open" }),
      stateVersion: 12,
      serverTime: "2026-10-11T18:00:00.000Z",
    });
    const results = buildV3CurrentContest({
      edition: { id: "ssc22", label: "SSC 22" },
      domains: domains({
        show: "ended",
        televote: "closed",
        results: "published",
      }),
      stateVersion: 13,
      serverTime: "2026-10-11T18:01:00.000Z",
    });

    expect(liveVoting.experience.mode).toBe("live-voting");
    expect(results.experience.mode).toBe("results");
  });

  it("reuses parent Action/Attention projections inside one bundle and summarizes them in bootstrap", () => {
    const bundle = buildV3ExperienceProjections({
      tasks: [
        task({
          id: "jury:required",
          kind: "jury",
          state: "needs_attention",
          actionRequired: true,
        }),
      ],
      editionId: "ssc22",
      stateVersion: "state-7",
      now: NOW,
    });
    const bootstrap = buildV3AppBootstrap(
      {
        user: { id: "user-1" },
        memberships: [{ delegationId: "oland" }],
        capabilities: ["jury.vote"],
        primaryContext: { editionId: "ssc22", delegationId: "oland" },
        serverTime: "2026-10-11T18:00:00.000Z",
      },
      bundle.attention,
    );

    expect(bundle.actions).toHaveLength(1);
    expect(bundle.journey.stateVersion).toBe("state-7");
    expect(bootstrap.attentionSummary.badgeCount).toBe(
      bundle.attention.badgeCount,
    );
    expect(bootstrap.capabilities).toEqual(["jury.vote"]);
    expect(bootstrap.schemaVersion).toBe("v3.1");
  });
});
