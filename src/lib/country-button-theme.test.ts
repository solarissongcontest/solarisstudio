import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { bestButtonText, resolveCountryButtonTheme } from "./country-button-theme";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country button theme", () => {
  it("uses the saved custom button colour when present", () => {
    expect(resolveCountryButtonTheme({ button_color: "#ff44aa" }, "#66ccaa")).toEqual({
      buttonColor: "#ff44aa",
      buttonForeground: bestButtonText("#ff44aa"),
      custom: true,
    });
  });

  it("falls back to the country accent when no custom button colour exists", () => {
    expect(resolveCountryButtonTheme({ button_color: null }, "#66ccaa")).toEqual({
      buttonColor: "#66ccaa",
      buttonForeground: bestButtonText("#66ccaa"),
      custom: false,
    });
  });

  it("chooses readable text automatically", () => {
    expect(bestButtonText("#f2f2f2")).toBe("#07131f");
    expect(bestButtonText("#102030")).toBe("#ffffff");
  });

  it("never paints the home brand as an active navigation card", () => {
    const css = source("src/country-button-theme.css");
    expect(css).toContain('.site-nav > div > a:first-child[aria-current="page"]');
    expect(css).toContain("background: transparent !important");
  });

  it("wires the button control into Country Appearance and public pages", () => {
    const routeTheme = source("src/components/RouteVisualTheme.tsx");
    expect(routeTheme).toContain("CountryButtonColourPanel");
    expect(routeTheme).toContain("CountryButtonThemeController");
    expect(routeTheme).toContain('import "@/country-button-theme.css"');
  });
});
