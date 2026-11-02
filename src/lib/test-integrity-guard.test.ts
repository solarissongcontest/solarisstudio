// test-integrity: allow-static-source-contract [architecture] -- this test intentionally contains suspicious source-reading fixtures to verify the guard itself
import { describe, expect, it } from "vitest";

import {
  analyzeTestIntegrity,
  extractProductionReadTargets,
} from "../../scripts/lib/test-integrity.mjs";

describe("test-integrity guard", () => {
  it("does not ban readFileSync by itself", () => {
    const source = `
      const source = readFileSync("src/lib/runtime.ts", "utf8");
      expect(source).toContain("supabase.co");
      expect(source).toContain("127.0.0.1");
    `;

    const result = analyzeTestIntegrity("src/lib/runtime.contract.test.ts", source);
    expect(result.productionReads).toEqual(["src/lib/runtime.ts"]);
    expect(result.flagged).toBe(false);
  });

  it("flags a production source read with many raw implementation assertions", () => {
    const source = `
      const source = readFileSync("src/components/Hero.tsx", "utf8");
      expect(source).toContain("hero-title");
      expect(source).toContain("hero-subtitle");
      expect(source).toContain("hero-actions");
      expect(source).toContain("hero-copy");
      expect(source).toContain("hero-footer");
    `;

    const result = analyzeTestIntegrity("src/components/Hero.contract.test.ts", source);
    expect(result.flagged).toBe(true);
    expect(result.rawAssertionCount).toBe(5);
    expect(result.reasons).toContain("5 raw source substring assertions");
  });

  it("flags multiple semantic lock-in signals even below the raw-count threshold", () => {
    const source = `
      const source = readFileSync("src/components/LaunchHero.tsx", "utf8");
      expect(source).toContain("Launches on October 7, 2026 for every Solaris viewer");
      expect(source).toContain("transform: translateY(-4px)");
      expect(source).toContain("launch-hero-final.webp");
    `;

    const result = analyzeTestIntegrity("src/components/LaunchHero.test.ts", source);
    expect(result.flagged).toBe(true);
    expect(result.signals.uiProse).toBeGreaterThan(0);
    expect(result.signals.cssImplementation).toBeGreaterThan(0);
    expect(result.signals.assetFilename).toBeGreaterThan(0);
    expect(result.signals.historicalDate).toBeGreaterThan(0);
  });

  it("allows a documented high-volume security static contract", () => {
    const source = `
      // test-integrity: allow-static-source-contract [security] -- proves CI cannot fall back to hosted Supabase endpoints
      const source = readFileSync("scripts/check-v3-production-isolation.ts", "utf8");
      expect(source).toContain("SUPABASE_URL");
      expect(source).toContain("VITE_SUPABASE_URL");
      expect(source).toContain("E2E_SUPABASE_URL");
      expect(source).toContain("supabase.co");
      expect(source).toContain("127.0.0.1");
      expect(source).toContain("localhost");
    `;

    const result = analyzeTestIntegrity("src/lib/isolation.contract.test.ts", source);
    expect(result.flagged).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.exception).toMatchObject({
      valid: true,
      category: "security",
    });
  });

  it("fails a malformed allow marker instead of silently bypassing review", () => {
    const source = `
      // test-integrity: allow-static-source-contract -- because reasons
      const source = readFileSync("src/components/Hero.tsx", "utf8");
    `;

    const result = analyzeTestIntegrity("src/components/Hero.test.ts", source);
    expect(result.flagged).toBe(true);
    expect(result.reasons[0]).toMatch(/invalid exception/);
  });

  it("reconstructs resolve/join style production source paths", () => {
    const source = `
      const source = readFileSync(resolve(root, "src", "components", "Hero.tsx"), "utf8");
    `;

    expect(extractProductionReadTargets(source)).toEqual([
      "src/components/Hero.tsx",
    ]);
  });

  it("does not treat test fixtures as production source targets", () => {
    const source = `
      const fixture = readFileSync("src/lib/example.test.ts", "utf8");
    `;

    expect(extractProductionReadTargets(source)).toEqual([]);
  });
});
