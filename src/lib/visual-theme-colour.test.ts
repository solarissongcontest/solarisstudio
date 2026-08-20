import { describe, expect, it } from "vitest";

import {
  DEFAULT_COUNTRY_THEME,
  countryBackgroundCss,
  getThemeColourReport,
  suggestThirdBackground,
  themeStyleProperties,
  type CountryVisualTheme,
} from "./visual-theme";

describe("country colour system", () => {
  it("uses no more than three background colours", () => {
    const theme: CountryVisualTheme = {
      ...DEFAULT_COUNTRY_THEME,
      backgroundPrimary: "#07131f",
      backgroundSecondary: "#243b73",
      backgroundTertiary: "#276c68",
      gradientStyle: "linear",
      gradientAngle: 145,
    };

    expect(countryBackgroundCss(theme)).toBe(
      "linear-gradient(145deg, #07131f 0%, #243b73 52%, #276c68 100%)",
    );
    expect(themeStyleProperties(theme)["--solaris-bg-tertiary"]).toBe("39 108 104");
  });

  it("keeps muddy owner colours as identity without making reading surfaces muddy", () => {
    const report = getThemeColourReport({
      backgroundPrimary: "#191700",
      backgroundSecondary: "#4d4500",
      accent: "#ffe147",
      surface: "#615607",
      textPrimary: "#fdff92",
      textMuted: "#e5df78",
    });

    expect(report.surface).not.toBe("#615607");
    expect(report.mainTextContrast).toBeGreaterThanOrEqual(4.5);
    expect(report.mutedTextContrast).toBeGreaterThanOrEqual(3.4);
    expect(report.buttonContrast).toBeGreaterThanOrEqual(4.5);
    expect(report.accentForeground).toBe("#07131f");
  });

  it("suggests a valid third colour from the existing palette", () => {
    expect(suggestThirdBackground(DEFAULT_COUNTRY_THEME)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
