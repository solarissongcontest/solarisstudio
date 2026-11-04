import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCountryLayoutMode } from "./country-layout-mode";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country page presentation ownership", () => {
  it("keeps three products distinct even at the same phone width", () => {
    expect(resolveCountryLayoutMode(false, true)).toBe("mobile-web");
    expect(resolveCountryLayoutMode(false, false)).toBe("desktop-web");
    expect(resolveCountryLayoutMode(true, true)).toBe("installed-app");
    expect(resolveCountryLayoutMode(true, false)).toBe("installed-app");
  });

  it("keeps the installed-app route gated and the browser route separate", () => {
    const gate = read("src/components/v3/V3DelegationRouteGate.tsx");
    const route = read("src/routes/countries/$code.tsx");
    expect(gate).toContain('if (!isAppMode) return <>{legacy}</>');
    expect(gate).toContain("<V3DelegationScreen");
    expect(route).toContain("resolveCountryLayoutMode(isAppMode, narrowViewport)");
    expect(route).toContain('countryLayoutMode === "mobile-web" ? (');
    expect(route).toContain("<CountryMobileWebMasthead");
    expect(route).toContain('data-country-layout-mode={countryLayoutMode}');
    expect(route).toContain("<ResponsiveTabs");
    expect(route).toContain("<CountryDesignV2Hero");
    expect(route).toContain("<CountryIdentityHero");
  });

  it("preserves the flag contract and isolates CSS from app and desktop", () => {
    const css = read("src/country-mobile-web.css");
    const masthead = read("src/components/country/CountryMobileWebMasthead.tsx");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain('[data-country-layout-mode="mobile-web"]');
    expect(css).not.toContain(":root {");
    expect(masthead).toContain("aspect-[3/2]");
    expect(masthead).toContain("FlagFrame");
    expect(masthead).not.toContain("useAllResults");
    expect(masthead).not.toContain("supabase");
  });
});
