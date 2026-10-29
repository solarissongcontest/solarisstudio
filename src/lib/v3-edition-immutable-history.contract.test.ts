import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const projection = () => read("src/lib/v3-edition.ts");
const server = () => read("src/integrations/v3/edition-source.server.ts");

describe("V3 Edition immutable published history", () => {
  it("preserves the exact immutable Result rows supplied by the server consumer", () => {
    const source = projection();
    expect(source).toContain("const publishedResults = input.results");
    expect(source).toContain("state: stateFromCount(publishedResults.length)");
    expect(source).toContain("rows: resultsState === \"available\" ? publishedResults : []");
    expect(source).not.toContain("competingEditionResults");
    expect(source).not.toContain('participant.participationStatus !== "confirmed"');
    expect(source).not.toMatch(/input\.results\.filter/);
  });

  it("keeps immutable publication authority in the existing server snapshot consumer", () => {
    const source = server();
    expect(source).toContain("loadV3PublishedResultSnapshot(resultShow.id)");
    expect(source).toContain("const resultRows = resultSnapshot?.rows ?? []");
    expect(source).toContain("const resultsPublished = resultSnapshot !== null");
    expect(source).not.toContain('.from("results")');
  });

  it("still fails closed before the immutable result publication gate opens", () => {
    const source = projection();
    expect(source).toContain('input.edition.resultsPublication !== "published"');
    expect(source).toContain('? "locked"');
    expect(source).toContain('showHref: resultsState === "available" ? input.resultShowHref : null');
    expect(source).toContain('rows: resultsState === "available" ? publishedResults : []');
  });

  it("does not add Result calculation or mutable participant authority to the Edition projection", () => {
    const source = projection();
    expect(source).not.toContain("juryPoints");
    expect(source).not.toContain("televotePoints");
    expect(source).not.toContain("calculate");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });
});
