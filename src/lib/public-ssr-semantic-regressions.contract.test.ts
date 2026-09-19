import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public SSR and semantic route regressions", () => {
  const publicTime = source("src/lib/public-time.ts");
  const banner = source("src/components/rules/RulebookVersionBanner.tsx");
  const overlay = source("src/lib/ssc-rules/runtime-overlay.ts");
  const router = source("src/router.tsx");
  const country = source("src/routes/countries/$code.tsx");

  it("does not combine Intl style shortcuts with timeZoneName during SSR", () => {
    expect(publicTime).toContain('timeZoneName: "short"');
    expect(publicTime).not.toContain('dateStyle: "medium",\n    timeStyle: "short",\n    timeZone,\n    timeZoneName');
  });

  it("renders the rulebook hydration fallback from immutable bundled metadata", () => {
    expect(overlay).toContain("export const BUNDLED_RULEBOOK_META = Object.freeze");
    expect(banner).toContain("BUNDLED_RULEBOOK_META.version");
    expect(banner).toContain("BUNDLED_RULEBOOK_META.status");
    expect(banner).not.toContain("SSC_RULEBOOK.version");
  });

  it("gives lazy routes a semantic pending main and page heading", () => {
    expect(router).toContain("defaultPendingComponent: RoutePending");
    expect(router).toContain('<main');
    expect(router).toContain('<h1');
  });

  it("keeps a visible country page heading while archive data loads", () => {
    expect(country).toContain("Loading {code.toUpperCase()}");
    expect(country).toContain("<h1");
  });
});
