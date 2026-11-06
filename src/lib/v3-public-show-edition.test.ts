import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isPublishedShowInPublishedEdition } from "./v3-public-show-edition";

describe("V3 public Show deep-link publication boundary", () => {
  const publicShow = {
    edition_id: "ssc-22-id",
    published: true,
    publication_config: { participants: true },
  };
  const publicEdition = { id: "ssc-22-id", published: true };

  it("admits a published Show only inside its exact published Edition", () => {
    expect(isPublishedShowInPublishedEdition(publicShow, publicEdition)).toBe(true);
    expect(isPublishedShowInPublishedEdition(publicShow, { ...publicEdition, id: "ssc-21-id" })).toBe(false);
  });

  it("fails closed on an unpublished Edition or a missing Show/Edition", () => {
    expect(isPublishedShowInPublishedEdition(publicShow, { ...publicEdition, published: false })).toBe(false);
    expect(isPublishedShowInPublishedEdition(publicShow, null)).toBe(false);
    expect(isPublishedShowInPublishedEdition(null, publicEdition)).toBe(false);
    expect(isPublishedShowInPublishedEdition(undefined, undefined)).toBe(false);
  });

  it("preserves the Show's own publication layer", () => {
    expect(isPublishedShowInPublishedEdition({ ...publicShow, published: false }, publicEdition)).toBe(false);
    expect(isPublishedShowInPublishedEdition({ ...publicShow, publication_config: null }, publicEdition)).toBe(false);
  });

  it("requires exact Edition data before rendering a Show and offers the canonical Edition route", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/shows/$showId.tsx"), "utf8");
    expect(source).toContain("useEditionById(showQuery.data?.edition_id)");
    expect(source).toContain("isPublishedShowInPublishedEdition(show, showEdition)");
    expect(source).toContain("const archiveQueries = [showQuery, editionQuery,");
    expect(source).toContain("if (!showIsPublic)");
    expect(source).toContain(">Show unavailable</h1>");
    expect(source).not.toContain(">{show.name}</h1>");
    expect(source).toContain('to="/editions/$slug"');
    expect(source).toContain("params={{ slug: showEdition.slug }}");
    expect(source).toContain("editionLabel(showEdition)");
    expect(source).not.toContain(".from(");
  });
});
