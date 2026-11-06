import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("legacy public shell respects mobile-browser navigation family", () => {
  it("offers native website header links and a complete accessible drawer, never an app-style fixed bottom dock", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('aria-label="Mobile website navigation"');
    expect(shell).toContain('to="/explore"');
    expect(shell).toContain('source: "mobile_web_header"');
    expect(shell).toContain('aria-label="Open navigation"');
    expect(shell).toContain('disabled={!navigationReady}');
    expect(shell).toContain("<PublicDrawerNavigation pathname={pathname} user={publicUser} />");
    expect(shell).not.toContain('className="mobile-quick-nav');
    expect(shell).not.toContain("quickNavigation");
    expect(shell).not.toContain('source: "mobile_bottom"');
  });

  it("preserves installed navigation and keeps browser content free of old dock clearance", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('{isAppMode && appChrome.tabBar !== "hidden" ? (');
    expect(shell).toContain("<AppTabBar");
    expect(shell).toContain('isAppMode ? "pb-24 sm:pb-24" : "pb-8 sm:pb-12"');
    expect(shell).toContain('!isAppMode && !isMySolarisWorkspace && !focusedParticipationTask ? (');
    expect(shell).toContain("<PublicFooter />");
    expect(shell).toContain('publicArea === "explore" ? "location" : undefined');
  });
});
