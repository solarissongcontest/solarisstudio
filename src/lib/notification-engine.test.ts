import { describe, expect, it } from "vitest";

import { scheduledTaskNotifications } from "./notification-engine";
import type { SolarisTask } from "./participation-os";

const baseTask: SolarisTask = {
  id: "confirmation:22",
  editionId: "22",
  kind: "confirmation",
  title: "Confirm your entry",
  description: "Confirmation is still missing.",
  state: "needs_attention",
  importance: "required",
  blocking: true,
  actionRequired: true,
  opensAt: null,
  deadline: "2026-10-04T18:00:00.000Z",
  route: "/confirmations",
  priority: 120,
  why: "No response has been recorded.",
};

const preferences = {
  enabled: true,
  categories: ["confirmations", "deadlines"] as const,
};

describe("notification relevance engine", () => {
  it("creates the 24h reminder only inside its window", () => {
    const result = scheduledTaskNotifications(
      baseTask,
      preferences,
      new Date("2026-10-03T18:00:00.000Z").getTime(),
    );
    expect(result.map((item) => item.kind)).toEqual(["deadline_24h"]);
  });

  it("stops reminders immediately after completion", () => {
    expect(
      scheduledTaskNotifications(
        { ...baseTask, state: "completed", actionRequired: false },
        preferences,
        new Date("2026-10-03T18:00:00.000Z").getTime(),
      ),
    ).toEqual([]);
  });

  it("respects notification categories", () => {
    expect(
      scheduledTaskNotifications(
        baseTask,
        { enabled: true, categories: ["results"] },
        new Date("2026-10-03T18:00:00.000Z").getTime(),
      ),
    ).toEqual([]);
  });
});
