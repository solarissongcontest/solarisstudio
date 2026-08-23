import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("public multi-round televote results", () => {
  it("uses the two televote rounds instead of a fake jury split", () => {
    const show = source("routes/shows/$showId.tsx");
    expect(show).toContain('label: multiRoundTelevote');
    expect(show).toContain('"Televote rounds"');
    expect(show).toContain("<TelevoteRoundsComparison");
    expect(show).toContain("!voting.juryEnabled && hasMultipleTelevoteRounds(voting)");
  });

  it("does not expose the jury scorechart when the show has no jury", () => {
    const show = source("routes/shows/$showId.tsx");
    expect(show).toContain('publication.detailed_voting && showJuryResults');
    expect(show).toContain('options.push({ value: "matrix", label: "Full scorechart" })');
    expect(show).toContain('tab === "matrix" && publication.detailed_voting && showJuryResults');
  });

  it("renders the separately stored round components", () => {
    const comparison = source("components/TelevoteRoundsComparison.tsx");
    expect(comparison).toContain("parseTelevoteComponents(result.televote_components)");
    expect(comparison).toContain('title={`${round.label} · ${round.weight}%`}');
    expect(comparison).toContain("standing.rawVotes");
    expect(comparison).toContain("standing.percentage");
  });
});
