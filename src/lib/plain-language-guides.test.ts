import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SIMPLE_COPY_FILES = [
  "src/components/AppShell.tsx",
  "src/components/admin/AdminCommandPalette.tsx",
  "src/components/admin/AdminNav.tsx",
  "src/components/admin/AdminSelectors.tsx",
  "src/components/admin/AdminShell.tsx",
  "src/routes/tools/index.tsx",
  "src/routes/_authenticated/admin/$slug.tsx",
  "src/routes/_authenticated/admin/more.tsx",
  "src/routes/_authenticated/admin/operations.tsx",
  "src/routes/_authenticated/admin/sync-health.tsx",
  "src/routes/televoting/admin/index.tsx",
] as const;

const OLD_VISIBLE_PHRASES = [
  "Organizer workspace",
  "Contest readiness",
  "Setup readiness",
  "Everyday workflow",
  "Canonical links",
  "Cross-service bindings",
  "service projections",
  "historical controller attribution",
  "Integration queue",
  "Televoting runtime",
  "Quality assurance",
  "archive-level edition settings",
  "Delegation access and country ownership controls",
  "HOD coverage is informational",
  "privileged organizer access",
  "aggregate televote points",
  "Results intelligence",
] as const;

describe("plain-language user interface", () => {
  for (const file of SIMPLE_COPY_FILES) {
    it(`${file} avoids old hard-to-understand UI phrases`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const phrase of OLD_VISIBLE_PHRASES) {
        expect(source, `${file} still contains: ${phrase}`).not.toContain(phrase);
      }
    });
  }

  it("public navigation includes the public guide", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");
    expect(source).toContain('to="/guide"');
    expect(source).toContain("Guide");
  });

  it("organizer navigation includes the organizer guide", () => {
    const desktop = readFileSync(resolve(process.cwd(), "src/components/admin/AdminNav.tsx"), "utf8");
    const mobile = readFileSync(resolve(process.cwd(), "src/components/admin/AdminFrame.tsx"), "utf8");
    expect(desktop).toContain('to: "/admin/guide"');
    expect(mobile).toContain('href: "/admin/guide"');
  });

  it("both guide pages explain features as questions and answers", () => {
    const publicGuide = readFileSync(resolve(process.cwd(), "src/routes/guide/index.tsx"), "utf8");
    const adminGuide = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/guide.tsx"), "utf8");
    expect(publicGuide).toContain("How to use Solaris Studio");
    expect(adminGuide).toContain("How to use the organizer tools");
    expect(publicGuide.match(/question:/g)?.length ?? 0).toBeGreaterThan(10);
    expect(adminGuide.match(/question:/g)?.length ?? 0).toBeGreaterThan(10);
  });
});
