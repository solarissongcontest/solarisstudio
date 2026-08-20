import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Solaris Studio guides and plain language", () => {
  const appShell = source("components/AppShell.tsx");
  const adminNav = source("components/admin/AdminNav.tsx");
  const adminFrame = source("components/admin/AdminFrame.tsx");
  const commandPalette = source("components/admin/AdminCommandPalette.tsx");
  const publicGuide = source("routes/guide/index.tsx");
  const adminGuide = source("routes/_authenticated/admin/guide.tsx");

  it("keeps both guide pages easy to find", () => {
    expect(appShell).toContain('to="/guide"');
    expect(adminNav).toContain('to: "/admin/guide"');
    expect(adminFrame).toContain('href: "/admin/guide"');
    expect(commandPalette).toContain('["Guide", "/admin/guide", "Help"');
  });

  it("keeps substantial public and organizer Q&A guides", () => {
    expect((publicGuide.match(/question:/g) ?? []).length).toBeGreaterThan(10);
    expect((adminGuide.match(/question:/g) ?? []).length).toBeGreaterThan(10);
    expect(publicGuide).toContain("How to use Solaris Studio");
    expect(adminGuide).toContain("How to use the organizer tools");
  });

  it("does not rename the current public navigation", () => {
    for (const text of [
      'label: "Insights"',
      'label: "Pulse"',
      'label: "Relationships"',
      "Participate",
      "Do something",
      "Organizer workspace",
    ]) {
      expect(appShell).toContain(text);
    }

    expect(appShell).not.toContain('label: "Recent activity"');
    expect(appShell).not.toContain('label: "Voting links"');
    expect(appShell).not.toContain(">Take part<");
  });

  it("does not rename the current organizer sections", () => {
    expect(adminNav).toContain(">Workspace<");
    expect(adminNav).toContain(">More<");

    const operations = source("routes/_authenticated/admin/operations.tsx");
    const voting = source("routes/televoting/admin/index.tsx");
    const more = source("routes/_authenticated/admin/more.tsx");
    const syncHealth = source("routes/_authenticated/admin/sync-health.tsx");

    for (const text of ["Contest readiness", "Next actions", "Readiness", "Notifications"])
      expect(operations).toContain(text);
    for (const text of ["Voting status", "Everyday workflow", "Advanced", "Result & audit tools"])
      expect(voting).toContain(text);
    for (const text of ["Contest management", "Engagement", "Quality assurance", "System"])
      expect(more).toContain(text);
    for (const text of [
      "Sync health",
      "Televoting runtime",
      "Canonical links",
      "Cross-service bindings",
      "Edition health",
      "Integration queue",
      "Problems & retries",
    ])
      expect(syncHealth).toContain(text);
  });

  it("keeps technical jargon out of normal explanatory copy", () => {
    const visibleCopy = [
      appShell,
      source("routes/tools/index.tsx"),
      source("routes/_authenticated/admin/operations.tsx"),
      source("routes/_authenticated/admin/more.tsx"),
      source("routes/_authenticated/admin/sync-health.tsx"),
      source("routes/televoting/admin/index.tsx"),
    ].join("\n");

    for (const phrase of [
      "service projections",
      "historical controller attribution",
      "privileged organizer access",
      "archive-level edition settings",
      "Delegation access and country ownership controls",
      "aggregate televote points",
      "Persistent organizer notices",
    ]) {
      expect(visibleCopy).not.toContain(phrase);
    }
  });

  it("keeps the existing public tool names", () => {
    const tools = source("routes/tools/index.tsx");
    for (const title of [
      "Solaris Pulse",
      "Prediction Arena",
      "Full Scorecharts",
      "Result Lab",
      "Taste DNA",
      "Broadcast Intelligence",
      "Jury Replay",
      "Archive Games",
      "Records",
      "Compare countries",
      "Relationships",
    ]) {
      expect(tools).toContain(title);
    }
  });
});
