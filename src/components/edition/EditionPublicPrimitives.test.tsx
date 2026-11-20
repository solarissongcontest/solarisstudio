import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditionHero, EditionNavigation } from "./EditionPublicPrimitives";

const css = readFileSync("src/edition-public-v5.css", "utf8");
const source = readFileSync("src/components/edition/EditionPublicPrimitives.tsx", "utf8");
const publicRoute = readFileSync("src/routes/editions/$slug.tsx", "utf8");

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
    expect((html.match(/<img\b/g) ?? [])).toHaveLength(1);
  });

  it("gives the independently published logo its own foreground identity", () => {
    const html = renderHero("/artwork/edition.webp", "/logos/edition.svg");
    expect(html).toContain('data-has-logo="true"');
    expect(html).toContain('class="edition-artwork-plate"');
    expect(html).toContain('alt="Official logo"');
    expect((html.match(/<img\b/g) ?? [])).toHaveLength(2);
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

  it("has a distinct cinematic composition for ordinary web without altering installed fallback", () => {
    expect(publicRoute).toContain('data-v3-web-cinematic={!isAppMode ? "" : undefined}');
    expect(css).toContain('.edition-public-page[data-v3-web-cinematic] .edition-hero');
    expect(css).toContain("@media (max-width: 47.99rem)");
    expect(css).toContain(".edition-hero-artwork::after");
    expect(css).toContain(".edition-artwork-plate img");
  });
});

describe("Edition section navigation accessibility", () => {
  it("keeps closed More controls honest and safely scopes independently rendered menus", () => {
    const items = ["Overview", "Participants", "Songs", "Schedule", "Results"].map((label) => ({
      label, href: `#${label.toLowerCase()}`,
    }));
    const html = renderToStaticMarkup(
      <div>
        <EditionNavigation label="Edition A sections" items={items} />
        <EditionNavigation label="Edition B sections" items={items} />
      </div>,
    );
    expect(html).toContain('aria-label="Edition A sections"');
    expect(html).toContain('aria-label="Edition B sections"');
    expect((html.match(/aria-expanded="false"/g) ?? [])).toHaveLength(2);
    // The panel is only in the DOM while open. A closed control must not
    // claim a reference to an element that does not yet exist.
    expect(html).not.toContain("aria-controls=");
    expect(source).toContain("const morePanelId = useId()");
    expect(source).toContain("aria-controls={moreOpen ? morePanelId : undefined}");
    expect(source).toContain("id={morePanelId}");
  });

  it("preserves scroll tracking on browsers without IntersectionObserver", () => {
    expect(source).toContain('typeof IntersectionObserver === "undefined"');
    expect(source).toContain('window.addEventListener("scroll", update, { passive: true })');
    expect(source).toContain("observer?.disconnect()");
  });
});
