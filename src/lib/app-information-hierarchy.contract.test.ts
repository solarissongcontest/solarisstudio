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
    expect(toolbar).toContain("const showCenteredContextTitle =");
    expect(toolbar).toContain('chrome.root && !showCenteredContextTitle ? (');
    expect(toolbar).toContain('<h1 className="solaris-app-toolbar-title">{chrome.title}</h1>');
    expect(styles).toContain('.app-main[data-solaris-app-root="true"] > .public-hub-hero');
    expect(styles).toContain('.app-main[data-solaris-app-root="true"] > .page-header');
  });

  it("keeps directory titles permanently centered in the safe-area toolbar", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const styles = source("src/styles/app-shell.css");

    expect(toolbar).toContain('toolbarOwnsHeading && (showBack || chrome.archetype === "directory")');
    expect(toolbar).toContain('<h1 className="solaris-app-toolbar-context-title">{chrome.title}</h1>');
    expect(toolbar).toContain('!chrome.root && !showCenteredContextTitle');
    expect(toolbar).not.toContain("IntersectionObserver");
    expect(toolbar).not.toContain("solaris-app-large-title-flow");
    expect(toolbar).not.toContain("data-title-collapsed");
    expect(styles).toContain("padding-top: env(safe-area-inset-top)");
    expect(styles).toContain('.solaris-app-toolbar[data-app-screen="directory"] .solaris-app-toolbar-context-title');
    expect(styles).toContain("transform: translate(-50%, -50%)");
  });

  it("keeps website heroes while compacting secondary installed-app headers", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain('@media (display-mode: standalone)');
    expect(styles).toContain('.app-main[data-solaris-app-mode="true"] .page-header:not(.directory-page-hero)');
    expect(styles).not.toContain('body .public-hub-hero { display: none');
  });

  it("takes critical and immersive recent exclusions from the canonical screen registry", () => {
    const recents = source("src/lib/public-recents.ts");
    expect(recents).toContain("resolveSolarisAppScreen(path)");
    expect(recents).toContain("screen.behavior.criticalTask || screen.behavior.immersive");
    expect(recents).not.toContain("NON_CONTENT_RECENT_PREFIXES");
    expect(recents).not.toContain('"/confirmations"');
    expect(recents).not.toContain('"/jury-voting"');
  });
});
