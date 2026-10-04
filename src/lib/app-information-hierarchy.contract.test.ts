import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("installed app information hierarchy", () => {
  it("marks app mode and root destinations in the shared shell", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('data-solaris-app-mode={isAppMode ? "true" : undefined}');
    expect(shell).toContain('data-solaris-app-root={isAppMode && isAppRootDestination ? "true" : undefined}');
  });

  it("uses the toolbar as the single root-page identity", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(toolbar).toContain('chrome.root ? (');
    expect(toolbar).toContain('<h1 className="solaris-app-toolbar-title">{chrome.title}</h1>');
    expect(styles).toContain('.app-main[data-solaris-app-root="true"] > .public-hub-hero');
    expect(styles).toContain('.app-main[data-solaris-app-root="true"] > .page-header');
  });

  it("keeps directory titles below the safe area and collapses them into toolbar context", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const styles = source("src/styles/app-shell.css");

    expect(toolbar).toContain('const hasLargeTitle = chrome.archetype === "directory"');
    expect(toolbar).toContain('data-collapsible-title={hasLargeTitle ? "true" : undefined}');
    expect(toolbar).toContain('className="solaris-app-large-title"');
    expect(toolbar).toContain("--solaris-toolbar-collapse-progress");
    expect(styles).toContain("padding-top: env(safe-area-inset-top)");
    expect(styles).toContain("html[data-solaris-app] .solaris-app-large-title");
    expect(styles).toContain("--solaris-toolbar-compact-opacity");
  });

  it("keeps website heroes while compacting secondary installed-app headers", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain('@media (display-mode: standalone)');
    expect(styles).toContain('.app-main[data-solaris-app-mode="true"] .page-header:not(.directory-page-hero)');
    expect(styles).not.toContain('body .public-hub-hero { display: none');
  });

  it("does not treat participation workflows as recently viewed content", () => {
    const recents = source("src/lib/public-recents.ts");
    expect(recents).toContain('"/confirmations"');
    expect(recents).toContain('"/jury-voting"');
    expect(recents).toContain('"/televoting"');
    expect(recents).toContain('NON_CONTENT_RECENT_PREFIXES.some');
  });
});
