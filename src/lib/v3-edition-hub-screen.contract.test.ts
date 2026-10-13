import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3EditionHubScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Edition hub screen architecture boundary", () => {
  it("renders the complete resolved Edition projection without acquiring data ownership", () => {
    expect(source).toContain("V3EditionPageProjection");
    expect(source).toContain("projection.participants.map");
    expect(source).toContain("projection.entries.map");
    expect(source).toContain("projection.shows.map");
    expect(source).toContain("projection.story");
    expect(source).toContain("projection.results.rows");

    for (const forbidden of [
      "@supabase",
      "supabase.",
      "fetch(",
      "useQuery",
      "useMutation",
      "useEffect",
      "localStorage",
      "sessionStorage",
      "indexedDB",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("owns real in-page section destinations instead of inert tab-shaped placeholders", () => {
    for (const id of [
      "edition-overview",
      "edition-participants",
      "edition-songs",
      "edition-schedule",
      "edition-stories",
      "edition-results",
    ]) {
      expect(source).toContain(`id=\"${id}\"`);
    }
    expect(source).not.toContain("?tab=participants");
    expect(source).not.toContain("?tab=songs");
    expect(source).not.toContain("?tab=schedule");
    expect(source).not.toContain("?tab=stories");
    expect(source).not.toContain("?tab=results");
  });

  it("keeps locked and empty publication states explicit and non-analytical", () => {
    expect(source).toContain('projection.results.state === "locked"');
    expect(source).toContain('projection.results.state === "empty"');
    expect(source).toContain("Official results are still locked");
    expect(source).toContain("no ranked rows are available yet");
    expect(source).not.toMatch(/juryPoints|televotePoints|scorechart|votingMatrix|leaderboard/);
    expect(source).not.toMatch(/publishResults|setResultsPublished|resultsPublication\s*=/);
  });

  it("reuses shared V3 primitives and consumes only resolved Live state", () => {
    expect(source).toContain('from "./V3Foundation"');
    expect(source).toContain("<V3Screen>");
    expect(source).toContain("<V3ScreenHeader");
    expect(source).toContain("projection.hub.liveAction ?");
    expect(source).not.toMatch(/Date\.now|new Date|setInterval|WebSocket|EventSource/);
  });
});
