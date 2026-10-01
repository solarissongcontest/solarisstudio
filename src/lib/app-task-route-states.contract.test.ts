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

  it("keeps installed navigation visible while ordinary routes are pending", () => {
    const router = source("src/router.tsx");
    expect(router).toContain("AppRouteStateFrame");
    expect(router).toContain("AppRouteSkeleton");
    expect(router).toContain("alreadyInsideParticipationChrome");
  });

  it("styles loading and recovery states inside the installed app shell", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("[data-solaris-app-route-state]");
    expect(styles).toContain(".solaris-app-route-state-card");
    expect(styles).toContain(".solaris-app-route-skeleton-card");
  });
});
