import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("PR 450 browser blocker regressions", () => {
  it("cancels queued liquid-glass work before it can update React after teardown", () => {
    const kube = source("src/components/app/KubeLiquidGlassBackdrop.tsx");

    expect(kube).toContain("let disposed = false;");
    expect(kube.match(/if \(disposed\) return;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(kube).toMatch(
      /return \(\) => \{\s*disposed = true;\s*cancelAnimationFrame\(frame\);\s*observer\.disconnect\(\);/,
    );
  });

  it("keeps Organizer filter controls explicitly named", () => {
    const countries = source("src/routes/_authenticated/admin/countries.tsx");
    const selectors = source("src/components/admin/AdminSelectors.tsx");
    const countryPicker = source("src/components/CountryPicker.tsx");

    expect(countries).toContain('aria-label="Search countries"');
    expect(countries).toContain('aria-label="Filter countries by readiness"');
    expect(selectors).toContain('aria-label="Search editions"');
    expect(countryPicker).toContain('aria-label="Search country"');
  });
});
