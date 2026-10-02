import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solaris Depth System governance visual contract", () => {
  it("removes the legacy rulebook hero and uses semantic depth surfaces", () => {
    const route = source("src/routes/rules/index.tsx");
    const home = source("src/components/rules/RulesHomeV5.tsx");
    const depth = source("src/components/SolarisDepth.tsx");

    expect(route).not.toContain("RulebookVersionBanner");
    expect(route).toContain("<RulesHomeV5");
    expect(home).toContain("SolarisDepthSurface");
    expect(home).toContain('variant="reading"');
    expect(home).toContain('variant="action"');
    expect(depth).toContain("SolarisDepthSafeZone");
  });

  it("keeps Solaris stars while exposing IDs and moving near stars away from governance reading columns", () => {
    const ambient = source("src/components/SolarisAmbientBackground.tsx");
    const css = source("src/solaris-depth.css");

    expect(ambient).toContain("data-star-id={star.id}");
    expect(css).toContain('body[data-solaris-family="rules"]');
    expect(css).toContain('body[data-solaris-family="integrity"]');
    expect(css).toContain('[data-star-id="n2"]');
    expect(css).toContain("left: 101% !important");
  });

  it("uses inline contextual service state instead of a floating governance outage pill", () => {
    const globalBanner = source("src/components/app/AppOfflineBanner.tsx");
    const depth = source("src/components/SolarisDepth.tsx");
    const report = source("src/components/integrity/IntegrityReportShell.tsx");

    expect(globalBanner).toContain('pathname.startsWith("/rules") || pathname.startsWith("/integrity")');
    expect(depth).toContain("Data limited · Rules remain available");
    expect(depth).toContain("Draft only · Submission unavailable");
    expect(report).toContain('context="report"');
  });

  it("renders Integrity reporting as one protected task sheet with grouped concerns", () => {
    const shell = source("src/components/integrity/IntegrityReportShell.tsx");
    const flow = source("src/components/integrity/IntegrityReportV5.tsx");

    expect(shell).toContain('variant="task"');
    expect(shell).toContain("solaris-depth-task-progress");
    expect(shell).toContain("solaris-depth-task-footer");
    expect(flow).toContain("CATEGORY_GROUPS");
    expect(flow).toContain("Fair participation");
    expect(flow).toContain("Safety & conduct");
    expect(flow).toContain("Platform & governance");
  });

  it("gives Rules and Integrity intentional app tab ownership", () => {
    const registry = source("src/lib/app-screen-registry.ts");

    expect(registry).toContain('if (/^\\/rules(\\/|$)/.test(pathname))');
    expect(registry).toContain('rootTab: "explore"');
    expect(registry).toContain('if (/^\\/integrity(\\/|$)/.test(pathname))');
    expect(registry).toContain('rootTab: "participate"');
  });

  it("reserves measured mobile scroll runway above the Liquid Glass tab bar", () => {
    const shellCss = source("src/styles/app-shell.css");
    const depthCss = source("src/solaris-depth.css");

    expect(shellCss).toContain("--solaris-app-bottom-obstruction");
    expect(shellCss).toContain("env(safe-area-inset-bottom)");
    expect(shellCss).toContain('data-solaris-app-tabbar="hidden"');
    expect(depthCss).toContain(".solaris-depth-page");
  });
});
