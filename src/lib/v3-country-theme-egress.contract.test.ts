import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buttonController = readFileSync(
  resolve(process.cwd(), "src/components/CountryButtonThemeController.tsx"),
  "utf8",
);
const flagController = readFileSync(
  resolve(process.cwd(), "src/components/CountryFlagLayerController.tsx"),
  "utf8",
);

const controllers = [buttonController, flagController];

describe("V3 country route theme request budget", () => {
  it("loads only the active route country's theme", () => {
    for (const source of controllers) {
      expect(source).toContain('import { useCountryTheme } from "@/lib/visual-theme"');
      expect(source).toContain("useCountryTheme(country?.id)");
      expect(source).not.toContain("useCountryThemes");
    }
  });

  it("resolves the route country before starting the single-country theme query", () => {
    for (const source of controllers) {
      expect(source.indexOf("const country = useMemo")).toBeGreaterThan(-1);
      expect(source.indexOf("useCountryTheme(country?.id)")).toBeGreaterThan(
        source.indexOf("const country = useMemo"),
      );
    }
  });

  it("does not add a second Supabase authority or background refresh loop", () => {
    for (const source of controllers) {
      expect(source).not.toContain("supabase.");
      expect(source).not.toContain("setInterval(");
      expect(source).not.toContain("refetchInterval");
      expect(source).not.toContain("invalidateQueries");
    }
  });

  it("preserves the legacy flag-enabled fallback while narrowing the read", () => {
    expect(flagController).toContain("flag_enabled?: boolean | null");
    expect(flagController).toContain("row?.flag_enabled !== false");
    expect(buttonController).toContain("countryTheme?.accent ?? country.accent_color");
  });
});
