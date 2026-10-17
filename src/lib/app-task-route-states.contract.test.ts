import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 task and route-state foundation", () => {
  it("renders focused participation work without duplicate task chrome", () => {
    const shell = source("src/components/ParticipationServiceShell.tsx");
    const toolbar = source("src/components/app/AppToolbar.tsx");
    expect(shell).toContain("if (isAppMode)");
    expect(shell).toContain("data-solaris-app-task-shell");
    expect(toolbar).toContain('chrome.archetype === "task"');
    expect(toolbar).toContain("chrome.helpTo");
    expect(toolbar).toContain("solaris-app-toolbar-context-title");
  });

  it("renders the contextual install prompt through the shared overlay manager", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manager = source("src/components/app/AppOverlayManager.tsx");
    const prompt = source("src/components/app/AppInstallPrompt.tsx");
    expect(runtime).toContain("<AppOverlayManager");
    expect(manager).toContain("<AppInstallPrompt");
    expect(prompt).toContain("MIN_VISITS = 2");
    expect(prompt).toContain("REVEAL_DELAY_MS");
    expect(prompt).toContain("installPromptAllowedOnPath");
    expect(prompt).toContain("beforeinstallprompt");
  });

  it("keeps AppRuntime above root route errors and not-found states", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain("<AppRuntime>{children}</AppRuntime>");
    expect(root).toContain("<AppRouteStateFrame");
    expect(root).not.toContain("<AppRuntime>\n        <SolarisAnniversaryCelebration");
  });

  it("keeps ordinary installed navigation during pending routes but lets critical tasks own focused pending chrome", () => {
    const router = source("src/router.tsx");
    expect(router).toContain("resolveSolarisAppScreen(pathname).behavior.criticalTask");
    expect(router).toContain("if (isAppMode && criticalTask)");
    expect(router).toContain("AppRouteStateFrame");
    expect(router).toContain("AppRouteSkeleton");
    expect(router).not.toContain("alreadyInsideParticipationChrome");
  });

  it("keeps critical error and not-found recovery out of generic app chrome", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    expect(frame).toContain('resolveSolarisAppScreen(pathname, searchStr).behavior.criticalTask');
    expect(frame).toContain("shouldOwnCriticalRouteStateFrame(pathname, searchStr)");
    expect(frame).toContain('data-v3-critical-route-state={screen.id}');
    expect(frame).toContain('data-solaris-app-critical-task="true"');
    expect(frame).toContain('pathname.startsWith("/confirmations/admin")');
    expect(frame).toContain('pathname.startsWith("/televoting/admin")');
    expect(frame.indexOf("if (shouldOwnCriticalRouteStateFrame")).toBeLessThan(
      frame.indexOf("<AppShell>"),
    );
  });

  it("styles loading and recovery states inside the installed app shell", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("[data-solaris-app-route-state]");
    expect(styles).toContain(".solaris-app-route-state-card");
    expect(styles).toContain(".solaris-app-route-skeleton-card");
  });
});
