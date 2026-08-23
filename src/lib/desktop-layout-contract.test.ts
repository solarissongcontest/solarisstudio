import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public desktop layout contract", () => {
  const shell = read("src/components/AppShell.tsx");
  const css = read("src/desktop-public-layouts.css");

  it("assigns every public route to one of the shared layout families", () => {
    for (const layout of ["home", "reading", "directory", "detail", "data", "workspace"]) {
      expect(shell).toContain(layout);
    }
    expect(shell).toContain('className="public-layout-frame"');
  });

  it("uses a fluid twelve-column canvas while keeping reading pages restrained", () => {
    expect(css).toContain("--public-grid-columns: 12");
    expect(css).toContain("repeat(var(--public-grid-columns), minmax(0, 1fr))");
    expect(css).toContain("--public-reading-measure: 72ch");
    expect(css).toContain("@media (min-width: 1600px)");
  });

  it("does not carry route-specific typography overrides", () => {
    expect(css).not.toContain('data-solaris-route="pulse"');
  });
});
