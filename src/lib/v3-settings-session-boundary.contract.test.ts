import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(resolve(process.cwd(), "src/routes/settings.tsx"), "utf8");

describe("V3 settings account-state boundary", () => {
  it("does not treat a failed session lookup as a signed-out notification account", () => {
    expect(settings).toContain("session.isLoading || session.isError ? undefined");
    expect(settings).toContain("session.isError ? (");
    expect(settings).toContain("Account state unavailable");
    expect(settings).toContain("A failed session check is not treated as a signed-out account.");
    expect(settings).toContain("session.refetch()");
  });

  it("keeps confirmed anonymous notification settings behind sign-in with safe return intent", () => {
    expect(settings).toContain("Sign in to manage notifications");
    expect(settings).toContain('search={{ redirect: "/settings" }}');
  });

  it("keeps device-only preferences available without fabricating account ownership", () => {
    expect(settings).toContain("Spoiler-free mode");
    expect(settings).toContain("Keep screen awake in Show Mode");
    expect(settings).toContain("useAppExperiencePreferences()");
    expect(settings).not.toContain("supabase.auth");
  });
});
