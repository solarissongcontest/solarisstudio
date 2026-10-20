import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildAdminContextualSection } from "@/components/admin/admin-contextual-navigation";

const more = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const system = readFileSync("src/routes/_authenticated/admin/system.tsx", "utf8");

function occurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("Organizer V3 More and System Settings catalog", () => {
  it("uses the canonical low-frequency Organizer group taxonomy", () => {
    for (const title of [
      "Governance",
      "Platform",
      "Integrations",
      "Engagement",
      "Product QA",
      "System",
      "Historical tools",
    ]) {
      expect(more).toContain(`title: "${title}"`);
    }

    expect(more).not.toContain('title: "People & Access"');
    expect(more).not.toContain('title: "Editions & Archive"');
  });

  it("uses the same canonical taxonomy in the More contextual navigation", () => {
    const moreSection = buildAdminContextualSection("/admin/more", "ssc-21", "SSC21");

    expect(moreSection?.domain.id).toBe("more");
    expect(moreSection?.tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Governance",
      "Platform",
      "Integrations",
      "Engagement",
      "Product QA",
      "System",
      "Historical tools",
    ]);
    expect(moreSection?.tabs.map((tab) => tab.label)).not.toContain("Trust & Governance");
    expect(moreSection?.tabs.map((tab) => tab.label)).not.toContain("People & access");
  });

  it("keeps overlapping route prefixes in exactly one More group", () => {
    const activeLabels = (path: string) =>
      buildAdminContextualSection(path, "ssc-21")?.tabs
        .filter((tab) => tab.active(path))
        .map((tab) => tab.label) ?? [];

    expect(activeLabels("/admin/system-operations")).toEqual(["Integrations"]);
    expect(activeLabels("/admin/sync-health")).toEqual(["Integrations"]);
    expect(activeLabels("/admin/system")).toEqual(["System"]);
    expect(activeLabels("/admin/anniversary")).toEqual(["Engagement"]);
    expect(activeLabels("/admin/anniversary-dates")).toEqual(["Historical tools"]);
    expect(activeLabels("/admin/hod-history")).toEqual(["Historical tools"]);
  });

  it("preserves each migrated low-frequency destination exactly once while regrouping it", () => {
    for (const route of [
      "/admin/integrity-investigations",
      "/admin/integrity-preclearance",
      "/admin/integrity-appeals",
      "/admin/rules-manager",
      "/admin/rule-interpretations",
      "/admin/access-permissions",
      "/admin/country-accounts",
      "/admin/hod-history",
      "/admin/editions",
      "/admin/time-machine",
      "/admin/edition-simulator",
      "/admin/anniversary-dates",
      "/admin/predictions",
      "/admin/fantasy",
      "/admin/community-moderation",
      "/admin/anniversary",
      "/admin/feedback-studies",
      "/admin/beta-test",
      "/admin/admin-beta-feedback",
      "/admin/public-ux",
      "/admin/sync-health",
      "/admin/system-operations",
      "/admin/system",
      "/admin/feature-rollout",
      "/admin/guide",
      "/admin/menu",
    ]) {
      expect(occurrences(more, `to: "${route}"`), route).toBe(1);
    }
  });

  it("keeps System Settings honest about its current governed boundary", () => {
    expect(more).toContain('label: "System settings"');
    expect(more).toContain(
      "Remaining settings stay in their owning domain until governed.",
    );
    expect(system).toContain("previewPlatformModeChange");
    expect(system).toContain("applyPlatformModeChange");
    expect(system).toContain("<AdminConfirmSheet");
    expect(system).toContain("useCreateAdminDeadline");
    expect(system).toContain("useToggleAdminDeadline");
  });
});
