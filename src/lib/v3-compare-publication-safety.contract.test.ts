import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Compare publication safety", () => {
  it("derives the embedded voting relationship from the publication-safe archive", () => {
    const route = read("src/routes/compare/index.tsx");

    expect(route).toContain('import { buildPublicCountryArchive } from "@/lib/public-country-archive"');
    expect(route).toContain("buildPublicCountryArchive(");
    expect(route).toContain("publicArchive.editions");
    expect(route).toContain("publicArchive.jury");
    expect(route).toContain("publicArchive.results");
    expect(route).toContain("publicArchive.shows");
  });

  it("does not present missing unpublished voting detail as ordinary empty history", () => {
    const route = read("src/routes/compare/index.tsx");

    expect(route).toContain("Uses published detailed voting only.");
    expect(route).toContain("methodology, sample scope and limitations");
    expect(route).toContain("No published detailed voting data.");
  });

  it("keeps the public archive fail-closed for detailed jury and televote rows", () => {
    const archive = read("src/lib/public-country-archive.ts");

    expect(archive).toContain("publicationByShow.get(vote.show_id)?.detailed_voting === true");
  });
});
