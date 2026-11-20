import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditionHero } from "./EditionPublicPrimitives";

const css = readFileSync("src/edition-public-v5.css", "utf8");
const source = readFileSync("src/components/edition/EditionPublicPrimitives.tsx", "utf8");

function renderHero(artwork: string | null, logo: string | null): string {
  return renderToStaticMarkup(
    <EditionHero
      eyebrow="SSC"
      title="A published edition"
      artwork={artwork}
      artworkAlt="Official artwork"
      logo={logo}
      logoAlt="Official logo"
      status={<span>Published</span>}
    />,
  );
}

describe("public-web Edition identity artwork", () => {
  it("uses a published artwork as one decorative backdrop, not a duplicated logo plate", () => {
    const html = renderHero("/artwork/edition.webp", null);
    expect(html).toContain('data-has-artwork="true"');
    expect(html).toContain('data-has-logo="false"');
    expect(html).toContain('class="edition-hero-artwork"');
    expect(html).not.toContain('class="edition-artwork-plate"');
    expect((html.match(/<img\\b/g) ?? [])).toHaveLength(1);
  });

  it("gives the independently published logo its own foreground identity", () => {
    const html = renderHero("/artwork/edition.webp", "/logos/edition.svg");
    expect(html).toContain('data-has-logo="true"');
    expect(html).toContain('class="edition-artwork-plate"');
    expect(html).toContain('alt="Official logo"');
    expect((html.match(/<img\\b/g) ?? [])).toHaveLength(2);
  });

  it("keeps a readable editorial fallback without invented media", () => {
    const html = renderHero(null, null);
    expect(html).toContain('data-has-artwork="false"');
    expect(html).toContain('data-has-logo="false"');
    expect(html).toContain("A published edition");
    expect(html).not.toContain("<img");
    expect(css).toContain('.edition-hero[data-has-logo="false"]');
    expect(css).toContain('.edition-hero[data-has-artwork="false"]');
  });

  it("hides a failed individual asset without a cross-asset fallback", () => {
    expect(source).toContain('onError={() => setFailedArtwork(visibleArtwork)}');
    expect(source).toContain('onError={() => setFailedLogo(visibleLogo)}');
    expect(source).not.toContain("logo ?? artwork");
  });
});
