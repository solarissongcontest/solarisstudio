import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const wikiRoot = readFileSync(
  new URL("../routes/wiki/index.tsx", import.meta.url),
  "utf8",
);
const referenceRoot = readFileSync(
  new URL("../routes/encyclopedia/index.tsx", import.meta.url),
  "utf8",
);
const countryArticle = readFileSync(
  new URL("../routes/wiki/$code.tsx", import.meta.url),
  "utf8",
);

describe("V3 P33 Reference convergence", () => {
  it("removes the duplicate Wiki directory and preserves country intent", () => {
    expect(wikiRoot).toContain('throw redirect({');
    expect(wikiRoot).toContain('to: "/encyclopedia"');
    expect(wikiRoot).toContain('kind: "country"');
    expect(wikiRoot).toContain("replace: true");

    expect(wikiRoot).not.toContain("useCountries");
    expect(wikiRoot).not.toContain("SolarisSearchField");
    expect(wikiRoot).not.toContain("DIRECTORY_PAGE_SIZE");
  });

  it("presents one publication-safe Reference root instead of two competing products", () => {
    expect(referenceRoot).toContain('{ title: "Reference — Solaris Studio" }');
    expect(referenceRoot).toContain('title="Reference"');
    expect(referenceRoot).toContain('aria-label="Filter Reference"');
    expect(referenceRoot).toContain('className="sr-only">Search Reference');
    expect(referenceRoot).toContain("buildPublicCountryArchive");
    expect(referenceRoot).toContain('queryKey: ["studio2-feature", "public_encyclopedia"]');

    expect(referenceRoot).not.toContain('to="/wiki"');
    expect(referenceRoot).not.toContain('title="Encyclopedia"');
    expect(referenceRoot).not.toContain("Search Encyclopedia");
  });

  it("bounds and validates legacy/search nominations before presentation", () => {
    expect(referenceRoot).toContain("const REFERENCE_KINDS");
    expect(referenceRoot).toContain("parseReferenceKind(search.kind)");
    expect(referenceRoot).toContain("parseSearchHint(search.q)");
    expect(referenceRoot).toContain("parseSearchHint(search.artist)");
    expect(referenceRoot).toContain("value.trim().slice(0, 120)");
  });

  it("keeps rich country article bookmarks alive until their content has an equivalent V3 home", () => {
    expect(countryArticle).toContain('createFileRoute("/wiki/$code")');
    expect(countryArticle).toContain("CountryWikiExperience");
    expect(countryArticle).toContain('rel: "canonical"');

    expect(referenceRoot).toContain('href: `/wiki/${country.short_code}`');
  });

  it("does not invent private reference truth in the browser", () => {
    expect(referenceRoot).toContain("publicArchive.participants");
    expect(referenceRoot).toContain("publicArchive.shows");
    expect(referenceRoot).not.toContain("service_role");
    expect(referenceRoot).not.toContain("localStorage");
    expect(referenceRoot).not.toContain("sessionStorage");
  });
});
