import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSolarisAppScreen } from "./app-screen-registry";

const routerSource = () => readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");

describe("critical-task pending chrome", () => {
  it("keeps every canonical critical task out of the generic AppShell pending frame", () => {
    for (const pathname of [
      "/my-solaris/entry",
      "/confirmations",
      "/confirmations/edit/example",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/integrity/report",
    ]) {
      expect(resolveSolarisAppScreen(pathname).behavior.criticalTask, pathname).toBe(true);
    }

    expect(resolveSolarisAppScreen("/participate").behavior.criticalTask).toBe(false);
    expect(resolveSolarisAppScreen("/televoting/how-to-vote").behavior.criticalTask).toBe(false);
    expect(resolveSolarisAppScreen("/televoting/results").behavior.criticalTask).toBe(false);
  });

  it("derives pending chrome from the canonical registry instead of a route allowlist", () => {
    const source = routerSource();

    expect(source).toContain('import { resolveSolarisAppScreen } from "@/lib/app-screen-registry"');
    expect(source).toContain("resolveSolarisAppScreen(pathname).behavior.criticalTask");
    expect(source).toContain("if (isAppMode && criticalTask)");
    expect(source).not.toContain('pathname.startsWith("/confirmations") || pathname.startsWith("/televoting")');
    expect(source).not.toContain("alreadyInsideParticipationChrome");
  });

  it("keeps critical pending UI landmark-neutral and outside the generic app frame", () => {
    const source = routerSource();
    const criticalBranch = source.slice(
      source.indexOf("if (isAppMode && criticalTask)"),
      source.indexOf("if (isAppMode) {", source.indexOf("if (isAppMode && criticalTask)") + 1),
    );

    expect(criticalBranch).toContain("<section");
    expect(criticalBranch).toContain('aria-busy="true"');
    expect(criticalBranch).toContain("<AppRouteSkeleton />");
    expect(criticalBranch).not.toContain("<AppRouteStateFrame");
    expect(criticalBranch).not.toContain("<main");
    expect(criticalBranch).not.toContain("<h1");
  });
});