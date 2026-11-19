import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicLaunchAllows, standardPublicLaunchAllows } from "./public-launch-availability";

const source = readFileSync("src/routes/guide/index.tsx", "utf8");

// This check uses the actual Public launch policy, not a copied allowlist.
// The guide must not advertise links that immediately end in a denied route.
describe("public guide soft-launch availability", () => {
  it("marks every deferred help entry for caller-evaluated filtering", () => {
    const deferred = [
      "/scorecharts",
      "/result-lab",
      "/relationships",
      "/analysis",
      "/pulse",
      "/predictions",
      "/taste-dna",
      "/broadcast-intelligence",
      "/archive-games",
      "/tools",
    ];
    for (const route of deferred) {
      expect(publicLaunchAllows(route)).toBe(false);
      expect(source).toContain(`requires: "${route}"`);
    }
    expect(source).toContain("usePublicLaunchAvailability()");
    expect(source).toContain("typeof question.requires === \"string\"");
    expect(source).toContain("allows(question.requires)");
    expect(source).toContain("<GuideFAQ sections={visibleSections} />");
    expect(source).toContain(".filter((section) => section.questions.length > 0)");
  });

  it("preserves the full guide implementation but makes only approved areas public now", () => {
    for (const route of [
      "/results",
      "/participate",
      "/auth",
      "/rules",
      "/explore",
      "/site-directory",
    ]) {
      expect(standardPublicLaunchAllows(route)).toBe(true);
      expect(publicLaunchAllows(route)).toBe(["/participate", "/auth", "/rules"].includes(route));
      expect(source).toContain(`to="${route}"`);
    }
    expect(source).toContain('question: "Where can I see official results?"');
    expect(source).not.toContain("country account or predictions");
  });
});
