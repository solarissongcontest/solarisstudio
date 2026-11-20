import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShowWebCinematicHero } from "./ShowWebCinematicHero";

const route = readFileSync("src/routes/shows/$showId.tsx", "utf8");
const css = readFileSync("src/styles/v3-show-web-cinematic.css", "utf8");
const cinematic = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");

const basics = {
  name: "Grand Final",
  edition: "SSC 21",
  kind: "grand-final",
  publishedDescription: "Published show information.",
  actions: <a href="/editions/ssc21">Edition</a>,
};

describe("ordinary-web Show cinematic, without a new publication reader", () => {
  it("renders an editorial show identity from only the supplied published artwork", () => {
    const markup = renderToStaticMarkup(
      <ShowWebCinematicHero {...basics} artworkUrl="/published-edition.webp" />,
    );
    expect(markup).toContain('data-show-web-experience="editorial"');
    expect(markup).toContain('data-cinematic-entity="show"');
    expect(markup).toContain('data-has-image="true"');
    expect(markup).toContain("Grand Final");
    expect(markup).toContain("SSC 21");
    expect(markup).toContain("grand final");
    expect(markup).toContain("/published-edition.webp");
    expect(markup).toContain("Published show information.");
  });

  it("keeps a designed fallback and navigation if no published artwork exists", () => {
    const markup = renderToStaticMarkup(
      <ShowWebCinematicHero {...basics} artworkUrl={null} />,
    );
    expect(markup).toContain('data-has-image="false"');
    expect(markup).not.toContain("<img");
    expect(markup).toContain('href="/editions/ssc21"');
    expect(cinematic).toContain("setFailedUrl(usableImage)");
  });

  it("runs only after public Show/Edition and result-spoiler gates; PWA keeps its header", () => {
    expect(route.indexOf("if (!showIsPublic)")).toBeLessThan(
      route.indexOf("<ShowWebCinematicHero"),
    );
    expect(route.indexOf("if (hideResultSpoilers)")).toBeLessThan(
      route.indexOf("<ShowWebCinematicHero"),
    );
    expect(route).toContain("artworkUrl={showEdition.artwork_url ?? null}");
    expect(route).toContain("!isAppMode ? (");
    expect(route).toContain("<PageHeader");
    expect(css).toContain("@media (max-width: 47.99rem)");
    expect(css).toContain(".show-web-cinematic__identity");
  });
});
