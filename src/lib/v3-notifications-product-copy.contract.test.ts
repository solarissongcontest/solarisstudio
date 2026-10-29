import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Notifications product-copy contract", () => {
  const notifications = source("src/components/v3/V3NotificationsScreen.tsx");

  it("keeps internal authority doctrine out of ordinary user copy", () => {
    expect(notifications).not.toContain("Notifications are never the source of truth");
    expect(notifications).not.toContain("source of truth");
    expect(notifications).not.toContain("canonical notice");
    expect(notifications).not.toContain("authoritative official-notice");
    expect(notifications).toContain("Your required work is still available");
    expect(notifications).toContain("check Participate for current responsibilities and Notices for official messages");
  });

  it("retains clear user destinations for work, notices and preferences", () => {
    expect(notifications).toContain('title="Needs attention"');
    expect(notifications).toContain('title="Latest official messages"');
    expect(notifications).toContain('title="Delivery"');
    expect(notifications).toContain('title="Required work"');
    expect(notifications).toContain('to="/participate"');
    expect(notifications).toContain('to="/my-solaris/notices"');
    expect(notifications).toContain('to="/settings"');
  });

  it("formats notice timestamps deterministically without browser-default locale authority", () => {
    expect(notifications).toContain('import { formatEventDateTime } from "@/lib/public-time"');
    expect(notifications).toContain('formatEventDateTime(date, { locale: "en-GB" })');
    expect(notifications).not.toContain("Intl.DateTimeFormat(undefined");
    expect(notifications).not.toContain("toLocaleString(");
    expect(notifications).not.toContain("toLocaleTimeString(");
    expect(notifications).not.toContain("Date.now(");
  });

  it("stays a pure presentation surface rather than creating notification authority", () => {
    expect(notifications).not.toContain("supabase");
    expect(notifications).not.toContain("useQuery(");
    expect(notifications).not.toContain("useMutation(");
  });
});
