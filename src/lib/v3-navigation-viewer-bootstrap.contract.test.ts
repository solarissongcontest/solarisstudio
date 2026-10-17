import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = () => source("src/components/v3/V3AppShell.tsx");

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

  it("does not mount or enable live cross-page previews before viewer identity resolves", () => {
    const code = shell();
    const previousStart = code.indexOf("const previousSurface =");
    const readyStart = code.indexOf("const swipePreviewReady =", previousStart);
    const openTabStart = code.indexOf("const openTab =", readyStart);
    const surfaceBlock = code.slice(previousStart, readyStart);
    const readyBlock = code.slice(readyStart, openTabStart);

    expect(surfaceBlock).toMatch(/const previousSurface =\s+navigationIdentityReady &&/);
    expect(surfaceBlock).toMatch(/const nextSurface =\s+navigationIdentityReady &&/);
    expect(readyBlock).toContain("navigationIdentityReady &&");
    expect(readyBlock).toContain("swipePreviewSurfaces != null");
  });

  it("invalidates every gesture owner across resolving, anonymous and authenticated identity generations", () => {
    const code = shell();
    const cache = source("src/lib/account-cache-isolation.ts");

    expect(code).toContain("const navigationInteractionKey = navigationIdentityReady");
    expect(code).toContain('(navigationScope ?? "anonymous")');
    expect(code).toContain(': "resolving"');
    expect(code).toContain("interactionKey={navigationInteractionKey}");
    expect(code).toContain("key={navigationInteractionKey}");

    // Account changes remove the private rollout probe before the next viewer is
    // published, forcing the shell through the resolving interaction generation.
    expect(cache).toContain("v3-rollout-probe");
    expect(cache).toContain("clearPrivateAccountQueries(client)");
    expect(cache).toContain("previousUserId !== nextUserId");
  });
});
