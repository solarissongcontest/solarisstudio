import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CountryDesignV2 } from "@/lib/country-design-v2";
import { CountryWebCinematicHero } from "./CountryWebCinematicHero";

const route = readFileSync("src/routes/countries/$code.tsx", "utf8");
const css = readFileSync("src/styles/v3-country-web-cinematic.css", "utf8");

const identity = {
  code: "OL",
  name: "Oland",
  nativeName: "Ålanti",
  region: "South Hydra",
  flagImage: null,
  accentColor: "#cda923",
  description: "Published country identity",
};

describe("ordinary web Country cinematic Explore presentation", () => {
  it("renders a complete identity with a designed fallback when no hero has been published", () => {
    const html = renderToStaticMarkup(<CountryWebCinematicHero {...identity} />);
    expect(html).toContain('data-country-web-experience="editorial"');
    expect(html).toContain('data-has-image="false"');
    expect(html).toContain("Oland");
    expect(html).toContain("Ålanti");
    expect(html).toContain("Published country identity");
    expect(html).toContain("Flag of OL");
  });

  it("uses only the already-published design image and its recorded focal coordinates", () => {
    const design = {
      background: { mode: "image", imageUrl: "/approved-country-hero.webp", positionX: 25, positionY: 75 },
      palette: { backgroundSecondary: "#234567" },
    } as unknown as CountryDesignV2;
    const html = renderToStaticMarkup(<CountryWebCinematicHero {...identity} publishedDesign={design} />);
    expect(html).toContain('data-has-image="true"');
    expect(html).toContain("/approved-country-hero.webp");
    expect(html).toContain("25% 75%");
    expect(route).toContain("publishedDesign={publishedDesign}");
    expect(route).toContain("!isAppMode ? (");
    expect(route).toContain("designV2Query.data?.isPublishedV2");
  });

  it("keeps ordinary mobile browser and desktop compositions distinct from installed PWA", () => {
    expect(css).toContain("@media (max-width: 47.99rem)");
    expect(css).toContain("@media (min-width: 70rem)");
    expect(css).toContain(".country-web-cinematic__identity");
    expect(route).toContain(") : publishedDesign ? (");
    expect(route).toContain("<CountryDesignV2Hero");
    expect(route).toContain("<CountryIdentityHero");
  });
});
