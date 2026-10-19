import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 public N10 tab memory shell integration", () => {
  it("keeps per-tab memory viewer-scoped and waits for server-owned identity resolution", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const memory = source("src/lib/v3-public-navigation.ts");

    expect(shell).toContain("navigationIdentityReady");
    expect(shell).toContain("rollout.data.userId ?? null");
    expect(shell).toContain("navigationStorage = navigationIdentityReady ? undefined : null");
    expect(memory).toContain("scopeToken(scopeKey)");
    expect(memory).toContain("solaris:public-v3-navigation:v1");
  });

  it("remembers safe nested destinations and scroll without resurrecting focused work", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const memory = source("src/lib/v3-public-navigation.ts");

    expect(shell).toContain("rememberV3PublicLocation");
    expect(shell).toContain("updateV3PublicScrollPosition");
    expect(shell).toContain("consumeV3PublicNavigationRestore");
    expect(shell).toContain("getV3PublicTabDestination");
    expect(memory).toContain("screen.behavior.criticalTask");
    expect(memory).toContain("screen.behavior.immersive");
    expect(memory).toContain('screen.chrome.tabbar !== "full"');
  });

  it("resets an active nested tab to its root and scrolls an already-rooted tab to top", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain("resetV3PublicTabToRoot");
    expect(shell).toContain("alreadyActive && normalizedPath === normalizedRoot");
    expect(shell).toContain("window.scrollTo({ top: 0");
    expect(shell).toContain('runAppViewTransition(alreadyActive ? "pop" : "tab"');
  });

  it("keeps whole-page swipe fail-closed until route owners supply live adjacent surfaces", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).not.toContain("V3TopLevelSwipeSurface");
    expect(shell).not.toContain("swipePreviewSurfaces");
  });
});
