import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Results server sub-score publication boundary", () => {
  it("redacts Jury and Televote splits before returning the browser bundle", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain(
      "juryPoints: publication.jury_results === true ? row.jury_points : null",
    );
    expect(results).toContain(
      "televotePoints: publication.televote_results === true ? row.televote_points : null",
    );
    expect(results).not.toContain(
      "juryPoints: row.jury_points,\n      televotePoints: row.televote_points",
    );
  });

  it("keeps canonical publication flags as the only sub-score disclosure authority", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain("const publication = { jury_results: snapshot.availability.jury, televote_results: snapshot.availability.televote }");
    expect(results).toContain("juryPublished: publication.jury_results === true");
    expect(results).toContain("televotePublished: publication.televote_results === true");
    expect(results).not.toMatch(/localStorage|sessionStorage|Date\.now\(\).*jury|Date\.now\(\).*televote/);
  });
});
