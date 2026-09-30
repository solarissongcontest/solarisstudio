import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 native-feel polish", () => {
  it("uses progressive view transitions for app navigation without making them mandatory", () => {
    const transitions = source("src/lib/app-view-transitions.ts");
    const tabs = source("src/components/app/AppTabBar.tsx");
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const search = source("src/components/public/PublicCommandPalette.tsx");

    expect(transitions).toContain("startViewTransition");
    expect(transitions).toContain("prefers-reduced-motion: reduce");
    expect(transitions).toContain("if (!updateRan) await update()");
    expect(tabs).toContain('runAppViewTransition("tab"');
    expect(tabs).toContain('runAppViewTransition("pop"');
    expect(toolbar).toContain('runAppViewTransition("pop"');
    expect(search).toContain('runAppViewTransition("push"');
  });

  it("keeps persistent app chrome visually separate from content transitions", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("view-transition-name: solaris-app-toolbar");
    expect(styles).toContain("view-transition-name: solaris-app-tabbar");
    expect(styles).toContain('data-solaris-view-transition="push"');
    expect(styles).toContain('data-solaris-view-transition="pop"');
    expect(styles).toContain('data-solaris-view-transition="tab"');
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("shows minimal first-run guidance only inside the installed app", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const firstRun = source("src/components/app/AppFirstRun.tsx");
    expect(runtime).toContain("<AppFirstRun");
    expect(firstRun).toContain("solaris:app-first-run-complete:v1");
    expect(firstRun).toContain("Your SSC companion");
    expect(firstRun).toContain("allowedOnPath");
    expect(firstRun).toContain('pathname === "/app-launch"');
    expect(firstRun).toContain("Continue");
  });

  it("progressively prefers the existing installed window for repeat launches", () => {
    const manifest = JSON.parse(source("public/site.webmanifest")) as {
      start_url?: string;
      launch_handler?: { client_mode?: string | string[] };
    };
    expect(manifest.start_url).toBe("/app-launch");
    expect(manifest.launch_handler?.client_mode).toEqual([
      "navigate-existing",
      "auto",
    ]);
  });
});
