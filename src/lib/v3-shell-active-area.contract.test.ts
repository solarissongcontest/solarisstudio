import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solaris Studio V3 shell active-area architecture", () => {
  it("uses canonical app-screen hierarchy rather than pathname-only public area inference", () => {
    const resolver = read("src/lib/v3-shell-active-area.ts");
    const shell = read("src/components/v3/V3AppShell.tsx");

    expect(resolver).toContain("resolveSolarisAppScreen");
    expect(resolver).toContain("screen.hierarchy.rootTab");
    expect(shell).toContain("resolveV3ShellActiveArea");
    expect(shell).not.toContain("publicAreaForPath");
  });

  it("passes router search context into active-tab resolution", () => {
    const shell = read("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain("state.location.searchStr");
    expect(shell).toContain("resolveV3ShellActiveArea(pathname, searchStr)");
  });

  it("fails closed instead of highlighting Home for registry fallback routes", () => {
    const resolver = read("src/lib/v3-shell-active-area.ts");

    expect(resolver).toContain('screen.id === "fallback"');
    expect(resolver).toContain("return null");
  });

  it("keeps active-area projection pure", () => {
    const resolver = read("src/lib/v3-shell-active-area.ts");

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "Date.now(",
    ]) {
      expect(resolver).not.toContain(forbidden);
    }
  });
});
