import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (contents: string) =>
  contents.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const expectNoReactiveRouterLocationHook = (contents: string, path: string) => {
  const runtimeSource = stripComments(contents);

  for (const hookName of ["useRouterState", "useLocation"]) {
    const importPattern = new RegExp(
      `import\\s*\\{[^}]*\\b${hookName}\\b[^}]*\\}\\s*from\\s*["']@tanstack/react-router["']`,
      "s",
    );
    const callPattern = new RegExp(`\\b${hookName}\\s*\\(`);

    expect(runtimeSource, `${path} must not import ${hookName} during cold render`).not.toMatch(
      importPattern,
    );
    expect(runtimeSource, `${path} must not call ${hookName} during cold render`).not.toMatch(
      callPattern,
    );
  }
};

describe("hydration-safe root router location", () => {
  it("subscribes only after commit and only to fully resolved locations", () => {
    const path = "src/lib/hydration-safe-router-location.ts";
    const hook = source(path);
    const effectIndex = hook.indexOf("useEffect(() =>");
    const subscribeIndex = hook.indexOf('router.subscribe("onResolved"');

    expect(effectIndex).toBeGreaterThan(-1);
    expect(subscribeIndex).toBeGreaterThan(effectIndex);
    expect(hook).toContain("router.state.location.pathname");
    expect(hook).toContain("router.state.location.searchStr");
    expect(hook).toContain("commit(toLocation)");
    expectNoReactiveRouterLocationHook(hook, path);
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
      expectNoReactiveRouterLocationHook(contents, path);
      expect(contents, `${path} must use the post-commit location contract`).toContain(
        "useHydrationSafeRouterLocation",
      );
    }
  });
});
