import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 app shell migration contract", () => {
  it("keeps the five stable product areas and existing canonical routes", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    for (const destination of [
      ['home', '/', 'Home'],
      ['explore', '/explore', 'Explore'],
      ['participate', '/participate', 'Participate'],
      ['results', '/results', 'Results'],
      ['me', '/my-solaris', 'Me'],
    ] as const) {
      const [id, to, label] = destination;
      expect(shell).toContain(`id: "${id}", label: "${label}", to: "${to}"`);
    }
  });

  it("keeps Participate attention scoped while Notifications reuses the shared attention summary", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(shell).toContain('badge: id === "participate" ? participateAttentionCount : 0');
    expect(tabs).toContain('badge > 9 ? "9+" : badge');
    expect(shell).toContain("const attention = useAppAttentionSummary()");
    expect(shell).toContain('attention.me > 9 ? "9+" : attention.me');
    expect(shell).not.toContain("localStorage");
    expect(shell).not.toContain("sessionStorage");
  });

  it("uses canonical Liquid mobile navigation plus the desktop adaptation in the installed shell", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const desktop = source("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    const installedShell = shell.slice(shell.indexOf("export function V3AppShell("));

    expect(installedShell).toContain("<V3LiquidTabBar");
    expect(installedShell).toContain("<V3DesktopPrimaryNavigation");
    expect(installedShell).not.toContain("<V3BottomNavigation");
    expect(shell).toContain("export function V3BottomNavigation");
    expect(tabs).toContain('aria-label="Primary app navigation"');
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
    expect(desktop).toContain('aria-label="Primary app navigation"');
    expect(desktop).toContain(
      'aria-current={destination.active ? "page" : undefined}',
    );
  });

  it("keeps direct manipulation progressive rather than gesture-only navigation", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabs).toContain("<Link");
    expect(tabs).toContain('aria-label={navigationItemLabel(destination.label, badge)}');
    expect(tabs).toContain("onPointerMove={moveDrag}");
    expect(tabs).toContain("onPointerCancel={cancelDrag}");
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
    expect(shell).toContain("navigate({ to: v3PublicEntryHref(target) as any })");
    expect(shell).toContain('runAppViewTransition(alreadyActive ? "pop" : "tab"');
    expect(shell).toContain("V3TopLevelNavigationViewport");
    expect(shell).toContain("topLevelSwipePreviews?: V3TopLevelNavigationPreviews");
  });

  it("keeps swipe route authority in the shell without creating a second transition", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const viewport = source("src/components/v3/V3TopLevelNavigationViewport.tsx");

    expect(shell).toContain("getV3PublicTabDestination(");
    expect(shell).toContain("const commitSwipeDestination = (targetIndex: number) =>");
    expect(shell).toContain("markV3PublicNavigationRestore(target.entry");
    expect(shell).toContain("void navigate({ to: target.href as any })");
    expect(shell).toContain("onCommit={commitSwipeDestination}");
    expect(viewport).toContain("V3TopLevelSwipeSurface");
    const commitStart = shell.indexOf("const commitSwipeDestination =");
    const shellActionsStart = shell.indexOf("const shellActions =", commitStart);
    const commit = shell.slice(commitStart, shellActionsStart);
    expect(commit).not.toContain("runAppViewTransition");
  });
});
