import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const SNAPSHOT_CONSUMERS = [
  "src/integrations/v3/results-source.server.ts",
  "src/integrations/v3/edition-source.server.ts",
] as const;

describe("V3 Public immutable Result snapshot consumers", () => {
  for (const path of SNAPSHOT_CONSUMERS) {
    it(`${path} never falls back to mutable public.results`, () => {
      const source = read(path);

      expect(source).toContain("loadV3PublishedResultSnapshot");
      expect(source).not.toContain('.from("results")');
      expect(source).not.toMatch(/RESULT_COLUMNS\s*=/);
    });
  }

  it("keeps the Results root fail-closed on missing immutable publication", () => {
    const results = read("src/integrations/v3/results-source.server.ts");

    expect(results).toContain("if (!snapshot)");
    expect(results).toContain("input: hiddenInput(selectedEdition, selectedShow)");
    expect(results).toContain("juryPublished: snapshot.availability.jury");
    expect(results).toContain("televotePublished: snapshot.availability.televote");
  });

  it("keeps Edition outcome visibility bound to exact snapshot existence", () => {
    const edition = read("src/integrations/v3/edition-source.server.ts");

    expect(edition).toContain("const resultsPublished = resultSnapshot !== null");
    expect(edition).toContain('resultsPublication: resultsPublished ? "published" : "hidden"');
    expect(edition).toContain("resultShow && resultsPublished");
  });
});
