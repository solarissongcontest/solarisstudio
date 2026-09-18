import { describe, expect, it } from "vitest";

import {
  COUNTRY_ACCENT_OPTIONS,
  COUNTRY_CONTENT_LAYOUT_OPTIONS,
  COUNTRY_HERO_V2_OPTIONS,
  COUNTRY_SURFACE_OPTIONS,
  copyCountryDesignPart,
  defaultCountryDesignV2,
  legacyThemeToCountryDesignV2,
  normalizeCountryDesignV2,
} from "@/lib/country-design-v2";

describe("Country Design Builder V2", () => {
  it("exposes the agreed independent design axes", () => {
    expect(COUNTRY_SURFACE_OPTIONS.map((item) => item.id)).toEqual([
      "opaque", "transparent", "glass", "gradient", "elevated", "editorial",
    ]);
    expect(COUNTRY_HERO_V2_OPTIONS).toHaveLength(6);
    expect(COUNTRY_CONTENT_LAYOUT_OPTIONS).toHaveLength(6);
    expect(COUNTRY_ACCENT_OPTIONS).toHaveLength(9);
  });

  it("defaults to Solaris typography rather than a built-in visual preset", () => {
    const design = defaultCountryDesignV2();
    expect(design.typography.display.id).toBe("crastao");
    expect(design.typography.heading.id).toBe("gotham");
    expect(design.typography.body.id).toBe("gotham");
    expect(design.version).toBe(2);
  });

  it("maps V1 personalities into editable V2 drafts without publishing them", () => {
    const design = legacyThemeToCountryDesignV2({
      country_id: "country",
      background_primary: "#101010",
      background_secondary: "#202020",
      accent: "#d4af37",
      text_primary: "#ffffff",
      text_muted: "#cccccc",
      surface: "#181818",
      hero_layout: "glass-card",
      updated_at: new Date(0).toISOString(),
    });
    expect(design.surface).toBe("glass");
    expect(design.hero.layout).toBe("centered");
    expect(design.content.defaultLayout).toBe("showcase");
  });

  it("copies individual public-design parts without coupling the designs", () => {
    const current = defaultCountryDesignV2();
    const source = {
      ...defaultCountryDesignV2(),
      surface: "glass" as const,
      accent: "luxury" as const,
      hero: { ...defaultCountryDesignV2().hero, layout: "poster" as const },
    };
    const typographyOnly = copyCountryDesignPart(current, source, "typography");
    expect(typographyOnly.surface).toBe(current.surface);
    const heroOnly = copyCountryDesignPart(current, source, "hero");
    expect(heroOnly.hero.layout).toBe("poster");
    expect(heroOnly.surface).toBe(current.surface);
  });

  it("normalizes unsafe and out-of-range values before public use", () => {
    const design = normalizeCountryDesignV2({
      version: 2,
      surface: "nonsense",
      tuning: { radius: 999, spacing: 99, contentWidth: 1 },
      palette: {
        backgroundPrimary: "#ffffff",
        backgroundSecondary: "#ffffff",
        accent: "#ffffff",
        surface: "#ffffff",
        textPrimary: "#ffffff",
        textMuted: "#ffffff",
      },
    });
    expect(design.surface).toBe("opaque");
    expect(design.tuning.radius).toBe(40);
    expect(design.tuning.contentWidth).toBe(760);
    expect(design.palette.textPrimary).not.toBe("#ffffff");
  });
});
