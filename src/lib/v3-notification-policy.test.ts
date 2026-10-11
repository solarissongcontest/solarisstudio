import { describe, expect, it } from "vitest";

import type { V3ActionProjection } from "./v3-experience";
import { isV3QuietHours, projectV3NotificationPlan } from "./v3-notification-policy";

function action(overrides: Partial<V3ActionProjection> = {}): V3ActionProjection {
  return {
    id: "jury:ssc22-sf1",
    editionId: "22",
    kind: "jury",
    sourceState: "needs_attention",
    title: "Jury voting",
    description: "Continue your official ballot.",
    why: "Your delegation has an unfinished required ballot.",
    route: "/jury-voting",
    actionRequired: true,
    urgency: "high",
    impact: "blocking",
    deliveryClass: "required",
    opensAt: "2026-10-11T10:00:00.000Z",
    deadline: "2026-10-11T20:00:00.000Z",
    completed: false,
    ...overrides,
  };
}

const preferences = {
  enabled: true,
  pushEnabled: true,
  emailEnabled: false,
  quietHoursStart: "23:00",
  quietHoursEnd: "07:00",
  urgentDeadlineReminders: true,
} as const;

const context = {
  recipientId: "user-1",
  serverNow: "2026-10-11T16:00:00.000Z",
  recipientTimeZoneOffsetMinutes: 180,
} as const;

function byChannel(plan: ReturnType<typeof projectV3NotificationPlan>, channel: string) {
  return plan.channels.find((item) => item.channel === channel);
}

describe("V3 notification policy", () => {
  it("keeps required work visible on Home, Participate and the badge", () => {
    const plan = projectV3NotificationPlan(action(), preferences, context);

    expect(byChannel(plan, "home")?.deliver).toBe(true);
    expect(byChannel(plan, "participate")?.deliver).toBe(true);
    expect(byChannel(plan, "badge")?.deliver).toBe(true);
    expect(byChannel(plan, "push")?.deliver).toBe(true);
  });

  it("does not let a completed action keep an attention badge", () => {
    const plan = projectV3NotificationPlan(
      action({ actionRequired: false, completed: true, sourceState: "completed", urgency: "none", impact: "low" }),
      preferences,
      context,
    );

    expect(byChannel(plan, "home")?.deliver).toBe(false);
    expect(byChannel(plan, "badge")?.deliver).toBe(false);
    expect(byChannel(plan, "participate")?.deliver).toBe(true);
    expect(byChannel(plan, "push")?.deliver).toBe(false);
  });

  it("does not push low-value optional activity", () => {
    const plan = projectV3NotificationPlan(
      action({
        kind: "televote",
        deliveryClass: "optional",
        actionRequired: false,
        impact: "low",
        urgency: "none",
        sourceState: "available",
      }),
      preferences,
      context,
    );

    expect(byChannel(plan, "push")?.deliver).toBe(false);
    expect(byChannel(plan, "push")?.reason).toBe("low_value_channel");
    expect(byChannel(plan, "badge")?.deliver).toBe(false);
  });

  it("defers interruptive push during quiet hours instead of dropping the task", () => {
    const plan = projectV3NotificationPlan(action(), preferences, {
      ...context,
      serverNow: "2026-10-11T21:30:00.000Z", // 00:30 local at +03:00
    });

    expect(byChannel(plan, "push")?.deliver).toBe(false);
    expect(byChannel(plan, "push")?.deferred).toBe(true);
    expect(byChannel(plan, "push")?.reason).toBe("quiet_hours");
    expect(byChannel(plan, "home")?.deliver).toBe(true);
    expect(byChannel(plan, "badge")?.deliver).toBe(true);
  });

  it("supports quiet-hour ranges that cross midnight", () => {
    expect(isV3QuietHours("2026-10-11T21:30:00.000Z", "23:00", "07:00", 180)).toBe(true);
    expect(isV3QuietHours("2026-10-11T08:00:00.000Z", "23:00", "07:00", 180)).toBe(false);
  });

  it("fails closed on invalid server time instead of trusting a device clock", () => {
    expect(() => isV3QuietHours("not-a-time", "23:00", "07:00", 180)).toThrow(
      "valid serverNow",
    );
  });

  it("keeps dedupe keys stable for the same action/deadline and recipient", () => {
    const first = projectV3NotificationPlan(action(), preferences, context);
    const second = projectV3NotificationPlan(action(), preferences, {
      ...context,
      serverNow: "2026-10-11T16:05:00.000Z",
    });

    expect(first.dedupeGroup).toBe(second.dedupeGroup);
    expect(byChannel(first, "push")?.dedupeKey).toBe(byChannel(second, "push")?.dedupeKey);
  });

  it("can surface blocking organizer work in the organizer inbox without leaking it to normal users", () => {
    const normal = projectV3NotificationPlan(action(), preferences, context);
    const organizer = projectV3NotificationPlan(action(), preferences, { ...context, organizer: true });

    expect(byChannel(normal, "organizer_inbox")?.deliver).toBe(false);
    expect(byChannel(normal, "organizer_inbox")?.reason).toBe("organizer_only");
    expect(byChannel(organizer, "organizer_inbox")?.deliver).toBe(true);
  });

  it("retains an explainable why string for every delivery surface", () => {
    const plan = projectV3NotificationPlan(action(), preferences, context);
    expect(plan.channels.every((item) => item.why.length > 0)).toBe(true);
  });
});
