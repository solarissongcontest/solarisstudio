import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3EditionHubScreen.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../integrations/v3/edition-source.server.ts", import.meta.url),
  "utf8",
);

describe("V3 Edition published-outcome hierarchy", () => {
  it("promotes official outcomes only in canonical post-result experiences", () => {
    expect(source).toContain('experience === "results"');
    expect(source).toContain('experience === "post-edition"');
    expect(source).toContain('experience === "archived"');
    expect(source).toContain('projection.results.state === "available"');
    expect(source).toContain('row.rank === 1');
    expect(source).toContain('title="Edition outcome"');
    expect(source).toContain('tone="success">Official result');
  });

  it("moves Results ahead of discovery content for completed and archived editions", () => {
    expect(source).toContain("const OUTCOME_SECTION_ORDER");
    expect(source).toMatch(/"overview",\s*"results",\s*"participants",\s*"songs",\s*"schedule",\s*"stories"/s);
    expect(source).toContain("navigationSections.map");
  });

  it("keeps fallback outcome ordering owned by the immutable published result source", () => {
    expect(serverSource).toContain("loadV3PublishedResultSnapshot(resultShow.id)");
    expect(serverSource).toContain("const resultRows = resultSnapshot?.rows ?? []");
    expect(serverSource).toContain(".sort((a, b) => a.finalRank - b.finalRank)");
    expect(serverSource).not.toContain('.from("results")');
    expect(source).not.toMatch(/\.sort\([^)]*rank|final_rank/);
  });

  it("fails closed when publication metadata has no immutable Result version", () => {
    expect(serverSource).toContain("const resultsPublished = resultSnapshot !== null");
    expect(serverSource).toContain('resultsPublication: resultsPublished ? "published" : "hidden"');
    expect(serverSource).toContain(
      "resultShow && resultsPublished ? `/shows/${resultShow.id}?from=results` : null",
    );
  });

  it("uses the existing canonical result destination and avoids duplicate outcome actions", () => {
    expect(source).toContain("to={projection.results.showHref}");
    expect(source).toContain("projection.results.showHref && !prioritizeOutcome");
    expect(source).not.toMatch(/publishResults|setResultsPublished|resultsPublication\s*=/);
  });

  it("remains presentation-only and does not invent lifecycle or result authority", () => {
    for (const forbidden of [
      "@supabase",
      "supabase.",
      "fetch(",
      "useQuery",
      "useMutation",
      "Date.now",
      "new Date",
      "setInterval",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
