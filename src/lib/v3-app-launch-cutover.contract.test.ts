import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const coordinator = source("src/components/app/AppLaunchRestoreCoordinator.tsx");
const shell = source("src/components/v3/V3AppShell.tsx");
const memory = source("src/lib/v3-app-launch-memory.ts");

describe("V3 installed-app cold-launch cutover", () => {
  it("does not let the temporary safe root overwrite viewer-scoped V3 memory", () => {
    expect(shell).toContain("hasPendingAppLaunchTransaction");
    const effectStart = shell.indexOf("useEffect(() => {");
    const pendingCheck = shell.indexOf("hasPendingAppLaunchTransaction()", effectStart);
    const remember = shell.indexOf("rememberV3PublicLocation(", pendingCheck);
    expect(pendingCheck).toBeGreaterThan(effectStart);
    expect(remember).toBeGreaterThan(pendingCheck);
  });

  it("resolves the local session identity before reading scoped V3 launch memory", () => {
    expect(coordinator).toContain("let localUserId: string | null = null");
    expect(coordinator).toContain("localUserId = data.session?.user?.id ?? null");
    expect(coordinator).toContain("getV3PublicLaunchDestination(");
    expect(coordinator).toContain("localUserId,");
    expect(memory).toContain("readV3PublicNavigationState(storage, scopeKey)");
  });

  it("keeps rollback-compatible legacy memory and compares only a real retained candidate", () => {
    expect(coordinator).toContain("getAppLaunchDestinationFromSnapshot(");
    expect(coordinator).toContain("getRetainedAppLaunchCandidateFromSnapshot(");
    expect(coordinator).toContain("preferV3AppLaunchDestination(legacyCandidate, v3Target)");
    expect(coordinator).toContain(
      'memoryOwner = useV3 ? "v3" : legacyCandidate ? "legacy" : "safe_root"',
    );
    expect(memory).toContain("resolved.visitedAt !== stored.visitedAt");
    expect(memory).toContain("return v3VisitedAt > legacyVisitedAt");
  });

  it("arms both restore channels so either shell generation can consume the cold launch", () => {
    expect(coordinator).toContain("markAppNavigationRestore(target)");
    expect(coordinator).toContain(
      "markV3AppLaunchNavigationRestore(target, signedIn, undefined, localUserId)",
    );
    expect(memory).toContain("markV3PublicNavigationRestore(entry, storage, scopeKey)");
  });

  it("keeps critical, immersive and signed-out authenticated destinations out of V3 launch restore", () => {
    expect(memory).toContain("screen.behavior.criticalTask");
    expect(memory).toContain("screen.behavior.immersive");
    expect(memory).toContain('screen.chrome.tabbar !== "full"');
    expect(memory).toContain('screen.access.auth === "authenticated"');
    expect(memory).toContain("V3_APP_LAUNCH_RESTORE_MAX_AGE_MS");
  });

  it("restores same-route scroll directly instead of leaving an unconsumed one-shot marker", () => {
    const sameRouteStart = coordinator.indexOf("if (currentHref === targetHref)");
    const replaceStart = coordinator.indexOf("window.location.replace(targetHref)", sameRouteStart);
    const sameRouteBlock = coordinator.slice(sameRouteStart, replaceStart);
    expect(sameRouteBlock).toContain("clearAppLaunchTransaction()");
    expect(sameRouteBlock).toContain("target.scrollY > 0");
    expect(sameRouteBlock).toContain("window.scrollTo({ top: target.scrollY, behavior: \"auto\" })");
    expect(sameRouteBlock).not.toContain("markAppNavigationRestore");
  });
});
