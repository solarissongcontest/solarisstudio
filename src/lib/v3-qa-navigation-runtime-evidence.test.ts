import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateV3NavigationRuntimeEvidence } from "./v3-qa-navigation-runtime-evidence";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 navigation/PWA runtime evidence", () => {
  it("recognizes the actual current runtime owners rather than obsolete detector locations", () => {
    const evidence = evaluateV3NavigationRuntimeEvidence({
      appRuntime: source("src/components/app/AppRuntime.tsx"),
      swipeSurface: source("src/components/v3/V3TopLevelSwipeSurface.tsx"),
      serviceWorker: source("public/sw.js"),
    });

    expect(evidence.gestureArbitration).toBe("implemented");
    expect(evidence.standalonePwa).toBe("implemented");
    expect(evidence.safeUpdates).toBe("implemented");
    expect(evidence.resumeReconciliation).toBe("implemented");
    expect(evidence.offlineShell).toBe("foundation");
    expect(evidence.pwaAggregate).toBe("implemented");
  });

  it("fails closed when source markers are incomplete", () => {
    const evidence = evaluateV3NavigationRuntimeEvidence({
      appRuntime: "detectSolarisPlatform()",
      swipeSurface: "classifyV3SwipeIntent()",
      serviceWorker: null,
    });

    expect(evidence.gestureArbitration).toBe("foundation");
    expect(evidence.standalonePwa).toBe("foundation");
    expect(evidence.safeUpdates).toBe("foundation");
    expect(evidence.resumeReconciliation).toBe("foundation");
    expect(evidence.offlineShell).toBe("missing");
    expect(evidence.pwaAggregate).toBe("foundation");
  });

  it("does not convert source evidence into release certification", () => {
    const evidence = evaluateV3NavigationRuntimeEvidence({
      appRuntime: [
        "detectSolarisPlatform",
        "display-mode: standalone",
        "platform.isAppMode",
        "appUpdateSafety",
        "updatefound",
        "controllerchange",
        "controllerReloadPending",
        "SKIP_WAITING",
        "APP_RESUME_EVENT",
        "createAppLifecycleController",
        "registration?.update()",
      ].join("\n"),
      swipeSurface: [
        "elementBlocksV3TopLevelSwipe",
        "isV3BrowserEdgeGestureStart",
        "classifyV3SwipeIntent",
        "resolveV3TopLevelSwipePolicy",
        "shellInteractionBlocked",
      ].join("\n"),
      serviceWorker: "self.addEventListener('fetch', () => undefined)",
    });

    expect(Object.values(evidence)).not.toContain("tested");
    expect(Object.values(evidence)).not.toContain("parity");
    expect(Object.values(evidence)).not.toContain("certified");
  });

  it("drives the live completion dashboard from the shared current-runtime evidence", () => {
    const dashboard = source("scripts/generate-v3-completion-dashboard.ts");

    expect(dashboard).toContain("evaluateV3NavigationRuntimeEvidence");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.pwaAggregate");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.gestureArbitration");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.standalonePwa");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.safeUpdates");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.resumeReconciliation");
    expect(dashboard).toContain("state: navigationRuntimeEvidence.offlineShell");

    expect(dashboard).not.toContain(
      'state: existsSync("src/lib/v3-client-lifecycle.ts") ? "implemented" : "foundation"',
    );
    expect(dashboard).not.toContain(
      'sourceContains("src/components/v3/V3AppShell.tsx", /standalone|display-mode/)',
    );
    expect(dashboard).not.toContain(
      'hasPageViewport && sourceContains("src/components/v3/V3AppShell.tsx", /gesture|horizontal|carousel/i)',
    );
    expect(dashboard).toContain(
      'id: "N14", name: "final parity certification", state: "missing"',
    );
    expect(dashboard).toContain(
      'blocker: "P45 standalone/update/resume/offline release matrix not certified"',
    );
  });
});
