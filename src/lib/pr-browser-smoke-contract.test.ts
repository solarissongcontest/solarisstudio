import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("playwright.config.ts", "utf8");

function representativeProject(name: string) {
  const prStart = config.indexOf("const representativeCiProjects = [");
  const prEnd = config.indexOf("const exhaustiveProjects = [", prStart);
  expect(prStart).toBeGreaterThanOrEqual(0);
  expect(prEnd).toBeGreaterThan(prStart);

  const section = config.slice(prStart, prEnd);
  const projectStart = section.indexOf(`name: "${name}"`);
  expect(projectStart).toBeGreaterThanOrEqual(0);

  const nextProject = section.indexOf("\n  {", projectStart);
  return section.slice(projectStart, nextProject === -1 ? undefined : nextProject);
}

describe("PR browser smoke contract", () => {
  it("collects the complete representative failure set instead of stopping after one test", () => {
    expect(config).toContain("maxFailures: 0,");
    expect(config).not.toContain("maxFailures: prSmoke ? 1 : 0");
  });

  it("keeps the personality PR project on the release-relevant failure-state regression", () => {
    expect(representativeProject("personality-390")).toContain(
      "grep: /flag loading, failure and fallback states are deterministic/",
    );
  });

  it("keeps installed-app PR coverage limited to shell geometry and gesture interruption", () => {
    const installed = representativeProject("ios-pwa-portrait");
    expect(installed).toContain('testMatch: /installed-app\\.e2e\\.ts/');
    expect(installed).toContain(
      "grep: /installed app shell survives representative navigation without duplicate chrome|installed AppTabBar cancels held gestures/",
    );
    expect(installed).toContain('browserName: "webkit"');
  });
});
