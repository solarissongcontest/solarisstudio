import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditionHero } from "./EditionPublicPrimitives";

const route = readFileSync("src/routes/editions/$slug.tsx", "utf8");
const component = readFileSync("src/components/edition/EditionPublicPrimitives.tsx", "utf8");
const styles = readFileSync("src/styles/v3-visual-editorial-redesign.css", "utf8");

const base = {
  eyebrow: "Tetlehamn",
  title: "SSC 22",
  artworkAlt: "Official edition artwork",
  status: <span>Published</span>,
};

describe("Cinematic public Edition browser presentation", () => {
  it("treats published artwork as atmosphere and official logo as its own identity", () => {
    const markup = renderToStaticMarkup(
      <EditionHero {...base} editorialWeb artwork="/published-artwork.webp" logo="/official-logo.png" />,
    );
    expect(markup).toContain('data-edition-web-experience="editorial"');
    expect(markup).toContain('data-has-image="true"');
    expect(markup).toContain("/published-artwork.webp");
    expect(markup).toContain("/official-logo.png");
    expect(markup).toContain("edition-web-cinematic__logo");
    expect(markup).toContain("Published");
    expect(markup).not.toContain("edition-artwork-plate");
  });

  it("does not stretch the logo into background artwork when an edition has no image", () => {
    const markup = renderToStaticMarkup(
      <EditionHero {...base} editorialWeb logo="/official-logo.png" />,
    );
    expect(markup).toContain('data-has-image="false"');
    expect(markup).toContain("/official-logo.png");
    expect(component).toContain("setFailedLogo(visibleLogo)");
    expect(component).toContain("setFailedArtwork(visibleArtwork)");
  });

  it("leaves installed-app hero available and preserves publication gates", () => {
    expect(route).toContain("editorialWeb={!isAppMode}");
    expect(route).toContain("artwork={edition.artwork_url ?? null}");
    expect(route).toContain("logo={edition.logo ?? null}");
    expect(route).toContain("grandFinalPublication?.results");
    expect(route).toContain("resolveShowPublication");
    expect(component).toContain('className="edition-hero"');
    expect(component).toContain("<LiquidGlassBackdrop");
    expect(component).toContain('className="edition-navigation-mobile"');
    expect(styles).toContain("html:not([data-solaris-app]) .edition-editorial-refresh .edition-web-cinematic");
    expect(styles).toContain("@media (max-width: 767px)");
  });
});
