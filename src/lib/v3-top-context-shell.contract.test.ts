import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const foundation = source("src/components/v3/V3Foundation.tsx");
const styles = source("src/styles/v3-top-context.css");

describe("V3 shared top-context shell contract", () => {
  it("keeps the refinement isolated and loaded after the foundation styles", () => {
    const baseImport = foundation.indexOf('import "@/styles/v3-foundations.css"');
    const compactImport = foundation.indexOf('import "@/styles/v3-top-context.css"');

    expect(baseImport).toBeGreaterThanOrEqual(0);
    expect(compactImport).toBeGreaterThan(baseImport);
    expect(foundation).toContain('data-v3-top-context=""');
    expect(foundation).toContain('data-v3-shell-obstruction="top"');
  });

  it("keeps edition context and shell actions in one compact row", () => {
    expect(foundation).toContain('className="v3-top-context__edition"');
    expect(foundation).toContain('aria-label={`${edition}${phase ? `, ${phase}` : ""}`}');
    expect(foundation).toContain('className="v3-top-context__actions"');

    expect(styles).toContain("--v3-top-context-control-size: 2.75rem");
    expect(styles).toContain("--v3-top-context-row-height: 3.25rem");
    expect(styles).toContain("align-items: center");
    expect(styles).toContain("white-space: nowrap");
  });

  it("preserves safe areas and minimum 44px primary touch geometry", () => {
    expect(styles).toContain("env(safe-area-inset-top)");
    expect(styles).toContain("env(safe-area-inset-right)");
    expect(styles).toContain("env(safe-area-inset-left)");
    expect(styles).toContain("width: var(--v3-top-context-control-size)");
    expect(styles).toContain("height: var(--v3-top-context-control-size)");
  });

  it("defines one shared top obstruction for focus and anchor recovery", () => {
    expect(styles).toContain("--v3-top-context-obstruction");
    expect(styles).toContain("scroll-margin-block-start");
    expect(styles).toContain("[tabindex]:not([tabindex=\"-1\"])");
    expect(styles).toContain("a[href]");
    expect(styles).toContain("button");
    expect(styles).toContain("input");
  });

  it("retains a reduced-transparency fallback without changing geometry", () => {
    expect(styles).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(styles).toContain("-webkit-backdrop-filter: none");
    expect(styles).toContain("backdrop-filter: none");
    expect(styles).toContain("background: var(--v3-bg-subtle)");
  });
});
