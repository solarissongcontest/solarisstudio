import { describe, expect, it } from "vitest";

import type { SolarisTask } from "./participation-os";
import {
  canonicalizeParticipantTasks,
  participantTaskDedupeKey,
  projectParticipantTaskReadModel,
} from "./v3-task-engine";

function task(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: "confirmation:source-a",
    editionId: "22",
    kind: "confirmation",
    title: "Complete confirmation",
    description: "Confirmation remains required.",
    state: "needs_attention",
    importance: "required",
    blocking: true,
    actionRequired: true,
    opensAt: null,
    deadline: null,
    route: "/confirmations",
    priority: 120,
    why: "Canonical confirmation requirement remains unresolved.",
    ...overrides,
  };
}

describe("canonical participant Task Engine read model", () => {
  it("keeps singleton obligation identity stable across source ids and workflow states", () => {
    const required = task({ id: "confirmation-required:req-1", state: "needs_attention" });
    const completed = task({ id: "confirmation:22:g2", state: "completed", actionRequired: false });

    expect(participantTaskDedupeKey(required)).toBe("participant:22:confirmation");
    expect(participantTaskDedupeKey(completed)).toBe("participant:22:confirmation");
  });

  it("deterministically collapses duplicate evidence without depending on input order", () => {
    const weak = task({
      id: "hod:confirmation-complete",
      state: "completed",
      actionRequired: false,
      blocking: false,
      priority: 70,
    });
    const strong = task({
      id: "confirmation-required:req-1",
      state: "problem",
      actionRequired: true,
      blocking: true,
      priority: 140,
    });

    const a = canonicalizeParticipantTasks([weak, strong]);
    const b = canonicalizeParticipantTasks([strong, weak]);

    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      id: "participant:22:confirmation",
      state: "problem",
      actionRequired: true,
      blocking: true,
    });
  });

  it("does not falsely deduplicate distinct deadline obligations", () => {
    const result = canonicalizeParticipantTasks([
      task({ id: "deadline:a", kind: "deadline", route: "/my-solaris/tasks" }),
      task({ id: "deadline:b", kind: "deadline", route: "/my-solaris/tasks" }),
    ]);

    expect(result.map((item) => item.id).sort()).toEqual([
      "participant:22:deadline:deadline:a",
      "participant:22:deadline:deadline:b",
    ]);
  });

  it("uses server time for overdue classification and exposes authoritative projection metadata", () => {
    const projection = projectParticipantTaskReadModel(
      [
        task({
          kind: "entry",
          id: "entry:22",
          deadline: "2026-10-30T09:00:00.000Z",
          route: "/my-solaris/entry",
        }),
      ],
      "2026-10-30T09:01:00.000Z",
    );

    expect(projection).toMatchObject({
      schemaVersion: 1,
      audience: "participant",
      authoritativeSource: "participant-task-engine",
      serverTime: "2026-10-30T09:01:00.000Z",
    });
    expect(projection.items[0]).toMatchObject({
      id: "participant:22:entry",
      state: "overdue",
      deliveryClass: "required",
    });
    expect(projection.stateVersion).toMatch(/^p1-[0-9a-f]{8}$/);
  });

  it("is idempotent across reconciliation reruns", () => {
    const input = [
      task(),
      task({ id: "hod:confirmation", priority: 90 }),
      task({ id: "notice:one", kind: "notice", route: "/my-solaris/notices" }),
    ];
    const once = canonicalizeParticipantTasks(input);
    const twice = canonicalizeParticipantTasks(once);

    expect(twice).toEqual(once);
    expect(new Set(twice.map((item) => item.id)).size).toBe(twice.length);
  });

  it("rejects invalid server time instead of using a device clock fallback", () => {
    expect(() => projectParticipantTaskReadModel([task()], "not-a-date")).toThrow(
      "Participant Task projection requires a valid serverTime timestamp.",
    );
  });
});
