import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public SEO and structured metadata", () => {
  const root = source("src/routes/__root.tsx");
  const home = source("src/routes/index.tsx");
  const editions = source("src/routes/editions/index.tsx");
  const edition = source("src/routes/editions/$slug.tsx");
  const shows = source("src/routes/shows/index.tsx");
  const show = source("src/routes/shows/$showId.tsx");
  const country = source("src/routes/countries/$code.tsx");
  const wiki = source("src/routes/wiki/$code.tsx");
  const stories = source("src/routes/stories/index.tsx");
  const story = source("src/routes/stories/$editionSlug.tsx");

  it("publishes WebSite structured data from the document root", () => {
    expect(root).toContain('"@type": "WebSite"');
    expect(root).toContain('type: "application/ld+json"');
  });

  it("keeps primary public indexes canonical", () => {
    expect(home).toContain('rel: "canonical"');
    expect(editions).toContain('rel: "canonical"');
    expect(shows).toContain('rel: "canonical"');
    expect(stories).toContain("rel: 'canonical'");
  });

  it("gives dynamic archive entities canonical URLs and breadcrumbs", () => {
    for (const route of [edition, show, country, wiki, story]) {
      expect(route).toContain("BreadcrumbList");
      expect(route).toContain("canonical");
    }
  });

  it("keeps Wiki semantically headed while client-only identity data hydrates", () => {
    expect(wiki).toContain("Loading Terra Solaris Wiki article");
    expect(wiki).toContain("<h1");
  });
});
