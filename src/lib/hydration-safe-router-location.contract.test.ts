import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("hydration-safe root router location", () => {
  it("subscribes only after commit and only to fully resolved locations", () => {
    const hook = source("src/lib/hydration-safe-router-location.ts");
    const effectIndex = hook.indexOf("useEffect(() =>");
    const subscribeIndex = hook.indexOf('router.subscribe("onResolved"');

    expect(effectIndex).toBeGreaterThan(-1);
    expect(subscribeIndex).toBeGreaterThan(effectIndex);
    expect(hook).toContain("router.state.location.pathname");
    expect(hook).toContain("router.state.location.searchStr");
    expect(hook).toContain("commit(toLocation)");
    expect(hook).not.toContain("useRouterState");
    expect(hook).not.toContain("useLocation");
  });

  it("keeps the cold-start root tree off reactive TanStack location hooks", () => {
    const rootFiles = [
      "src/components/app/AppRuntime.tsx",
      "src/routes/__root.tsx",
      "src/components/app/AppLaunchRestoreCoordinator.tsx",
      "src/components/app/AppReconnectReconciler.tsx",
      "src/components/app/AppTelemetryBridge.tsx",
      "src/components/app/AppInstallPrompt.tsx",
      "src/components/app/AppOfflineBanner.tsx",
      "src/components/RouteVisualTheme.tsx",
      "src/components/SolarisAnniversaryCelebration.tsx",
      "src/components/rules/RulesGovernanceContext.tsx",
      "src/components/CountryFlagLayerController.tsx",
    ];

    for (const path of rootFiles) {
      const contents = source(path);
      expect(contents, `${path} must not subscribe during cold render`).not.toContain(
        "useRouterState",
      );
      expect(contents, `${path} must not subscribe with useLocation during cold render`).not.toContain(
        "useLocation",
      );
      expect(contents, `${path} must use the post-commit location contract`).toContain(
        "useHydrationSafeRouterLocation",
      );
    }
  });
});
