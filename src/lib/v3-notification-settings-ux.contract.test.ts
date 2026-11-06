import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const settings = () => read("src/components/mysolaris/MySolarisNotificationsPanel.tsx");
const centreRoute = () => read("src/routes/_authenticated/notifications.tsx");

describe("V3 Notification Settings and Quiet Hours UX", () => {
  it("organizes supported notification categories into user-facing groups", () => {
    const source = settings();

    expect(source).toContain('title: "Contest & delegation"');
    expect(source).toContain('title: "Live & voting"');
    expect(source).toContain('title: "Results"');
    expect(source).toContain('title: "Followed entities"');
    expect(source).toContain('title: "Optional engagement"');
    expect(source).toContain('keys: ["confirmations", "jury", "deadlines", "official"]');
    expect(source).toContain('keys: ["televoting"]');
    expect(source).toContain('keys: ["results"]');
    expect(source).toContain('keys: ["following"]');
    expect(source).toContain('keys: ["predictions"]');
  });

  it("gives mobile Quiet Hours an explicit toggle and phone-friendly time controls", () => {
    const source = settings();

    expect(source).toContain('data-v3-quiet-hours-mobile=""');
    expect(source).toContain('checked={quietHoursEnabled}');
    expect(source).toContain('onCheckedChange={setQuietHoursEnabled}');
    expect(source).toContain('aria-label="Quiet hours"');
    expect(source).toContain('type="time"');
    expect(source).toContain('aria-label="Quiet hours start time"');
    expect(source).toContain('aria-label="Quiet hours end time"');
    expect(source).toContain("Quiet Hours runs overnight");
    expect(source).toContain("Times follow {timeZone} on this device");
  });

  it("persists disabled Quiet Hours as null instead of inventing an always-active range", () => {
    const source = settings();

    expect(source).toContain("quiet_hours_start: quietHoursEnabled ? quietStart : null");
    expect(source).toContain("quiet_hours_end: quietHoursEnabled ? quietEnd : null");
    expect(source).toContain("setQuietHoursEnabled(Boolean(savedQuietStart && savedQuietEnd))");
  });

  it("uses one stable timezone context for display and persistence", () => {
    const source = settings();

    expect(source).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"');
    expect(source).toContain("timezone: timeZone");
  });

  it("shows Quiet Hours as Off in the notification centre when no range is stored", () => {
    const source = centreRoute();

    expect(source).toContain("preferenceRow?.quiet_hours_start?.slice(0, 5) ?? null");
    expect(source).toContain("preferenceRow?.quiet_hours_end?.slice(0, 5) ?? null");
    expect(source).toContain('quietStart && quietEnd ? `${quietStart}–${quietEnd}` : "Off"');
    expect(source).toContain("quietHoursLabel={quietHoursLabel}");
  });
});
