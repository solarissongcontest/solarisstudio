import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolvePublicPresentationMode } from "./public-presentation-mode";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("three-experience public layout boundary", () => {
  it("keeps installed PWA distinct from a phone-sized browser", () => {
    expect(resolvePublicPresentationMode(false, true)).toBe("mobile-web");
    expect(resolvePublicPresentationMode(false, false)).toBe("desktop-web");
    expect(resolvePublicPresentationMode(true, true)).toBe("installed-app");
    expect(resolvePublicPresentationMode(true, false)).toBe("installed-app");
  });

  it("subscribes to web resize without guessing runtime from the viewport", () => {
    const hook = source("src/lib/use-public-presentation-mode.ts");
    expect(hook).toContain("useSolarisApp()");
    expect(hook).toContain("useSyncExternalStore(");
    expect(hook).toContain("resolvePublicPresentationMode(isAppMode, narrowViewport)");
    expect(hook).toContain('addEventListener("change", notify)');
    expect(hook).toContain("query.addListener?.(notify)");
  });

  it("keeps Records V3 app gating intact while making browser composition explicit", () => {
    const records = source("src/routes/records/index.tsx");
    expect(records).toContain("if (!platformResolved)");
    expect(records).toContain("if (isAppMode)");
    expect(records).toContain("<V3RecordsGate fallback={<LegacyRecordsPage />} />");
    expect(records).toContain('presentationMode === "mobile-web"');
    expect(records).toContain("data-records-mobile-web-header");
    expect(records).toContain("data-records-mobile-web-categories");
    expect(records).toContain("data-records-mobile-web-row");
    expect(records).toContain("aria-pressed={tab === option.value}");
    expect(records).toContain("mobileWeb={mobileWeb}");
    expect(records).toContain("<ResponsiveTabs");
    expect(records).toContain('"glass flex min-h-[250px]'); // Retained as the desktop fallback.
    expect(records).toContain("buildCanonicalFanRecords");
    expect(records).toContain("archivedFinalEditions");
  });
});
