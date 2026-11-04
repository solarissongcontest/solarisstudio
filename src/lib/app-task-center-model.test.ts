import { describe, expect, it } from "vitest";
import type { SolarisTask } from "./participation-os";
import {
  appTaskTimingTarget,
  exactAppTaskTiming,
  partitionAppTaskCenter,
  relativeAppTaskTiming,
} from "./app-task-center-model";

const NOW = Date.parse("2026-11-04T18:00:00.000Z");

function task(overrides: Partial<SolarisTask>): SolarisTask {
  return {
    id: "task",
    editionId: "edition-22",
    kind: "televote",
    title: "Public voting",
    description: "Vote in the Grand Final",
    state: "available",
    importance: "optional",
    blocking: false,
    actionRequired: false,
    opensAt: "2026-11-04T17:00:00.000Z",
    deadline: "2026-11-04T19:00:00.000Z",
    route: "/televoting",
    priority: 30,
    why: "Public vote is open",
    ...overrides,
  };
}

describe("installed app canonical task center integration", () => {
  it("keeps open optional voting discoverable without counting it as required attention", () => {
    const groups = partitionAppTaskCenter([
      task({ id: "public-vote" }),
      task({
        id: "jury",
        kind: "jury",
        title: "Official jury vote",
        state: "needs_attention",
        importance: "required",
        actionRequired: true,
      }),
    ]);
    expect(groups.needsAttention.map((item) => item.id)).toEqual(["jury"]);
    expect(groups.available.map((item) => item.id)).toEqual(["public-vote"]);
    expect(groups.next).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });

  it("partitions every canonical task state once, preserving server priority order", () => {
    const states = [
      "completed",
      "available",
      "needs_attention",
      "upcoming",
      "waiting",
      "problem",
      "finished",
    ] as const;
    const input = states.map((state) =>
      task({
        id: state,
        state,
        actionRequired: state === "needs_attention" || state === "problem",
        importance: state === "needs_attention" || state === "problem" ? "required" : "optional",
      }),
    );
    const groups = partitionAppTaskCenter(input);
    expect(groups.needsAttention.map((item) => item.id)).toEqual(["problem", "needs_attention"]);
    expect(groups.available.map((item) => item.id)).toEqual(["available"]);
    expect(groups.next.map((item) => item.id)).toEqual(["upcoming", "waiting"]);
    expect(groups.completed.map((item) => item.id)).toEqual(["completed", "finished"]);
    expect([
      ...groups.needsAttention,
      ...groups.next,
      ...groups.available,
      ...groups.completed,
    ].map((item) => item.id).sort()).toEqual([...states].sort());
  });

  it("labels an upcoming due-only delegation deadline as due, not as an opening", () => {
    const due = task({
      kind: "deadline",
      state: "upcoming",
      importance: "required",
      opensAt: null,
    });
    expect(appTaskTimingTarget(due)).toEqual({
      target: "2026-11-04T19:00:00.000Z",
      label: "Due",
    });
    expect(relativeAppTaskTiming(due, NOW)).toMatch(/^Due in /);
    expect(exactAppTaskTiming(due)?.label).toMatch(/^Due /);
  });

  it("labels an open optional vote as closing while preserving its optional status", () => {
    const vote = task({});
    expect(appTaskTimingTarget(vote)?.label).toBe("Closes");
    expect(relativeAppTaskTiming(vote, NOW)).toMatch(/^Closes in /);
    expect(relativeAppTaskTiming(vote, Date.parse(vote.deadline!))).toBe("Closing now");
  });

  it("never shows an opening countdown for submitted or finished votes", () => {
    for (const state of ["completed", "finished"] as const) {
      const vote = task({ state, opensAt: "2026-11-05T18:00:00.000Z" });
      expect(appTaskTimingTarget(vote)).toBeNull();
      expect(relativeAppTaskTiming(vote, NOW)).toBeNull();
      expect(exactAppTaskTiming(vote)).toBeNull();
    }
  });

  it("does not invent due dates for waiting tasks without schedule evidence", () => {
    const waiting = task({ state: "waiting", opensAt: null, deadline: null });
    expect(relativeAppTaskTiming(waiting, NOW)).toBeNull();
    expect(exactAppTaskTiming(waiting)).toBeNull();
  });
});
