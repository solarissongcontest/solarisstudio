import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 settings hub", () => {
  it("registers a public device-settings destination in the Me area", () => {
    const navigation = source("src/lib/public-navigation.ts");
    const more = source("src/components/app/AppMoreNavigation.tsx");
    const mySolaris = source("src/lib/my-solaris-navigation.ts");
    expect(navigation).toContain('"app-settings"');
    expect(navigation).toContain('"/settings"');
    expect(navigation).toContain('"me"');
    expect(more).toContain('{ to: "/settings", label: "App settings"');
    expect(more).toContain("Account & security");
    expect(mySolaris).toContain('label: "Settings"');
    expect(mySolaris).toContain('to: "/settings"');
  });

  it("reuses the canonical app-experience preference store", () => {
    const settings = source("src/routes/settings.tsx");
    expect(settings).toContain("useAppExperiencePreferences");
    expect(settings).toContain("preferences.spoilerFree");
    expect(settings).toContain("preferences.keepScreenAwake");
    expect(settings).toContain('update({ spoilerFree: checked })');
    expect(settings).toContain('update({ keepScreenAwake: checked })');
  });

  it("consolidates push categories and quiet hours without creating another notification system", () => {
    const settings = source("src/routes/settings.tsx");
    const notifications = source("src/components/mysolaris/MySolarisNotificationsPanel.tsx");
    expect(settings).toContain("MySolarisNotificationsPanel");
    expect(settings).toContain("includeSpoilerFree={false}");
    expect(notifications).toContain("Quiet hours");
    expect(notifications).toContain("Push notifications");
    expect(notifications).toContain("CATEGORIES");
  });

  it("separates safe public offline metadata from critical workflow drafts", () => {
    const settings = source("src/routes/settings.tsx");
    const offline = source("src/lib/app-offline-snapshot.ts");
    expect(settings).toContain("clearOfflinePublicIndex");
    expect(settings).toContain("clearSolarisRuntimeCaches");
    expect(settings).toContain("does not delete confirmation, jury or voting drafts");
    expect(offline).toContain("OFFLINE_PUBLIC_INDEX_KEY");
    expect(offline).not.toContain("confirmation-draft");
  });

  it("reports system accessibility state instead of inventing conflicting overrides", () => {
    const settings = source("src/routes/settings.tsx");
    expect(settings).toContain("prefers-reduced-motion: reduce");
    expect(settings).toContain("prefers-reduced-transparency: reduce");
    expect(settings).toContain("System Reduce Transparency");
  });

  it("keeps install and privacy information on the same settings surface", () => {
    const settings = source("src/routes/settings.tsx");
    expect(settings).toContain('title="Install"');
    expect(settings).toContain('title="Privacy & app information"');
    expect(settings).toContain("app.canPush");
    expect(settings).toContain("ballot contents");
  });
});
