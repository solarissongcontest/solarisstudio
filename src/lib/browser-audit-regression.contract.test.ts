import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const organizerAliases = [
  ["src/routes/_authenticated/admin/index.tsx", "/admin/operations"],
  ["src/routes/_authenticated/admin/action-center.tsx", "/admin/tasks"],
  ["src/routes/_authenticated/admin/action-centre.tsx", "/admin/tasks"],
  ["src/routes/_authenticated/admin/status.tsx", "/admin/sync-health"],
  ["src/routes/_authenticated/admin/integrity.tsx", "/admin/integrity-investigations"],
  ["src/routes/_authenticated/admin/beta-feedback.tsx", "/admin/beta1-feedback"],
  ["src/routes/_authenticated/admin/control-room-v2.tsx", "/admin/control-room"],
] as const;

describe("Browser Audit regression boundaries", () => {
  it("mounts Organizer alias routes before redirecting them", () => {
    for (const [path, target] of organizerAliases) {
      const route = source(path);
      expect(route).toContain("Navigate");
      expect(route).toContain(`to="${target}"`);
      expect(route).not.toContain("beforeLoad:");
      expect(route).not.toContain("throw redirect");
    }

    for (const path of [
      "src/routes/_authenticated/admin/action-center.tsx",
      "src/routes/_authenticated/admin/action-centre.tsx",
    ]) {
      expect(source(path)).toContain('search={{ filter: "all" }}');
    }
  });

  it("keeps the Storytelling audit reason explicitly named", () => {
    const storytelling = source("src/routes/_authenticated/admin/storytelling.tsx");
    expect(storytelling).toContain('aria-label="Reason for editorial changes"');
  });

  it("keeps Results Reveal page identity in every feature state", () => {
    const resultsReveal = source("src/routes/_authenticated/admin/results-reveal.tsx");
    expect(resultsReveal).toContain("function ResultsRevealHeader()");
    expect(resultsReveal.match(/<ResultsRevealHeader \/>/g)).toHaveLength(3);
  });

  it("keeps Browser Audit controls and launch probes aligned with runtime contracts", () => {
    const mediaAssets = source("src/routes/_authenticated/admin/media-assets.tsx");
    const integrity = source("src/routes/_authenticated/admin/integrity-investigations.tsx");
    const installedApp = source("e2e/installed-app.e2e.ts");
    const auditHelpers = source("e2e/audit-helpers.ts");

    expect(mediaAssets).toContain('aria-label="Review reason"');
    expect(integrity).toContain('aria-label="Search integrity cases"');
    expect(installedApp.match(/page\.goto\("\/app-launch", \{ waitUntil: "commit" \}\)/g)).toHaveLength(6);
    expect(installedApp).not.toContain('page.goto("/app-launch", { waitUntil: "domcontentloaded" })');
    expect(auditHelpers).toContain("await page.bringToFront();");
    expect(auditHelpers).toContain("window.focus();");
  });
});
