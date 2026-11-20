import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryWebCinematicHero } from "./CountryWebCinematicHero";
import type { CountryDesignV2 } from "@/lib/country-design-v2";

const route = readFileSync("src/routes/countries/$code.tsx", "utf8");
const css = readFileSync("src/styles/v3-country-web-cinematic.css", "utf8");
const hero = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");

const identity = { code: "OL", name: "Oland", nativeName: "Ålanti", region: "South Hydra", accentColor: "#cda923" };

describe("Country cinematic web masthead", () => {
  it("renders the identity with a stable abstract fallback and no duplicate flag", () => {
    const html = renderToStaticMarkup(<CountryWebCinematicHero {...identity} />);
    expect(html).toContain('data-country-web-experience="editorial"');
    expect(html).toContain('data-has-image="false"');
    expect(html).toContain("Oland");
    expect(html).toContain("Ålanti");
    expect(html).not.toContain("No public country description");
    expect(html).not.toContain('data-flag-role="official"');
    expect(route).toContain('className="country-editorial-identity-strip"');
    expect(route).toContain("image={country.flag_image}");
  });

  it("uses only an already published V2 media projection and saved focal point", () => {
    const publishedDesign = {
      background: { mode: "image", imageUrl: "/approved-hero.webp", positionX: 30, positionY: 65 },
      palette: { backgroundSecondary: "#123456" },
    } as unknown as CountryDesignV2;
    const html = renderToStaticMarkup(<CountryWebCinematicHero {...identity} publishedDesign={publishedDesign} />);
    expect(html).toContain('data-has-image="true"');
    expect(html).toContain("/approved-hero.webp");
    expect(html).toContain("30% 65%");
    expect(route).toContain("designV2Query.data?.isPublishedV2");
    expect(route).toContain("publishedDesign={publishedDesign}");
    expect(hero).toContain("onError={() => setFailedUrl(usableImage)}");
  });

  it("keeps web and installed-app heroes separate and fits a plain browser viewport", () => {
    expect(route).toContain("!isAppMode ? (");
    expect(route).toContain("<CountryDesignV2Hero");
    expect(route).toContain("<CountryIdentityHero");
    expect(css).toContain("html:not([data-solaris-app]) .country-web-cinematic");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("var(--cinematic-canvas)");
  });
});
