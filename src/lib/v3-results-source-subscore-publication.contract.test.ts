import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Results server sub-score publication boundary", () => {
  it("uses the immutable published snapshot as the only browser Result payload", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain("loadV3PublishedResultSnapshot(selectedShow.id)");
    expect(results).toContain(
      "juryPoints: snapshot.availability.jury ? row.juryPoints ?? null : null",
    );
    expect(results).toContain(
      "televotePoints: snapshot.availability.televote ? row.televotePoints ?? null : null",
    );
    expect(results).not.toContain('.from("results")');
    expect(results).not.toContain("row.jury_points");
    expect(results).not.toContain("row.televote_points");
  });

  it("keeps System snapshot availability as the only sub-score disclosure authority", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain("juryPublished: snapshot.availability.jury");
    expect(results).toContain("televotePublished: snapshot.availability.televote");
    expect(results).toContain("if (!snapshot)");
    expect(results).toContain("input: hiddenInput(selectedEdition, selectedShow)");
    expect(results).not.toMatch(/localStorage|sessionStorage|Date\.now\(\).*jury|Date\.now\(\).*televote/);
  });
});
