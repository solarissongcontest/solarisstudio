import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bestButtonText,
  deriveCountryButtonColor,
  resolveCountryButtonTheme,
} from "./country-button-theme";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country button theme", () => {
  it("uses the saved custom button colour exactly when present", () => {
    expect(resolveCountryButtonTheme({ button_color: "#ff44aa" }, "#66ccaa")).toEqual({
      buttonColor: "#ff44aa",
      buttonForeground: bestButtonText("#ff44aa"),
      custom: true,
    });
  });

  it("derives a contrasting action colour instead of blindly copying a bright page accent", () => {
    const derived = deriveCountryButtonColor("#7cff21");
    expect(derived).not.toBe("#7cff21");
    expect(resolveCountryButtonTheme({ button_color: null }, "#7cff21")).toEqual({
      buttonColor: derived,
      buttonForeground: bestButtonText(derived),
      custom: false,
    });
  });

  it("keeps darker page accents in the same palette while improving separation", () => {
    const derived = deriveCountryButtonColor("#18395f");
    expect(derived).not.toBe("#18395f");
    expect(/^#[0-9a-f]{6}$/i.test(derived)).toBe(true);
  });

  it("chooses readable text automatically", () => {
    expect(bestButtonText("#f2f2f2")).toBe("#07131f");
    expect(bestButtonText("#102030")).toBe("#ffffff");
  });

  it("excludes the Solaris Studio brand from active-navigation card styling", () => {
    const chrome = source("src/calm-public-chrome.css");
    const buttons = source("src/country-button-theme.css");
    expect(chrome).toContain(':not([aria-label="Solaris Studio home"])');
    expect(chrome).toContain('.site-nav a[aria-label="Solaris Studio home"]');
    expect(chrome).toContain("background: transparent !important");
    expect(buttons).toContain('.site-nav a[aria-label="Solaris Studio home"]');
  });

  it("uses a strong related shade for secondary themed actions instead of a mostly-grey surface", () => {
    const css = source("src/country-button-theme.css");
    expect(css).toContain("--country-button-rich");
    expect(css).toContain("--country-button-soft");
    expect(css).toContain("background: var(--country-button-rich) !important");
    expect(css).toContain("background: var(--country-button-soft) !important");
  });

  it("wires the button control into Country Appearance and public pages", () => {
    const routeTheme = source("src/components/RouteVisualTheme.tsx");
    const personalityStyles = source("src/components/CountryPersonalityStyles.tsx");
    expect(routeTheme).toContain("CountryButtonColourPanel");
    expect(routeTheme).toContain("resolveCountryButtonTheme");
    expect(routeTheme).toContain('document.body.style.setProperty("--solaris-button"');
    expect(personalityStyles).toContain('import buttonStyles from "@/country-button-theme.css?inline"');
  });
});
