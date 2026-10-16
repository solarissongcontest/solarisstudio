import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shell = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3AppShell.tsx"), "utf8");

describe("V3 navigation viewer bootstrap", () => {
  it("does not treat unresolved viewer identity as anonymous route-memory authority", () => {
    const code = shell();

    expect(code).toContain("const navigationIdentityReady =");
    expect(code).toContain("!rollout.isLoading && !rollout.isError && rollout.data != null");
    expect(code).toContain('if (typeof window === "undefined" || !navigationIdentityReady) return');
    expect(code).toContain("const navigationStorage = navigationIdentityReady ? undefined : null");
  });

  it("keeps semantic navigation available while memory fails closed", () => {
    const code = shell();

    expect(code).toContain("getV3PublicTabDestination(id, navigationStorage, navigationScope)");
    expect(code).toContain("resetV3PublicTabToRoot(id, navigationStorage, navigationScope)");
    expect(code).toContain("if (navigationIdentityReady) {");
    expect(code).toContain("markV3PublicNavigationRestore(target, undefined, navigationScope)");
  });

  it("does not enable live cross-page previews before viewer identity resolves", () => {
    const code = shell();
    const readyStart = code.indexOf("const swipePreviewReady =");
    const openTabStart = code.indexOf("const openTab =", readyStart);
    const readyBlock = code.slice(readyStart, openTabStart);

    expect(readyBlock).toContain("navigationIdentityReady &&");
    expect(readyBlock).toContain("swipePreviewSurfaces != null");
  });
});
