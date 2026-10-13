import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3EditionHubScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Edition hub screen architecture boundary", () => {
  it("renders the canonical Edition hub projection without acquiring data ownership", () => {
    expect(source).toContain("V3EditionHubProjection");
    expect(source).toContain("projection.sections.map");
    expect(source).toContain("projection.hero.resultsAvailable");
    expect(source).toContain("projection.liveAction");

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

  it("keeps locked and empty sections non-interactive", () => {
    expect(source).toContain('section.state === "locked"');
    expect(source).toContain('section.state === "empty"');
    expect(source).toContain("Available after official publication");
    expect(source).toContain("Nothing public here yet");
  });

  it("does not own result rows, score analysis or publication decisions", () => {
    expect(source).not.toMatch(/scorechart|juryPoints|televotePoints|totalPoints|leaderboard/);
    expect(source).not.toMatch(/resultRows|winner:|placement:|points:/);
    expect(source).not.toMatch(/publishResults|setResultsPublished|resultsPublication\s*=/);
  });

  it("reuses the shared V3 screen primitives and only consumes resolved Live state", () => {
    expect(source).toContain('from "./V3Foundation"');
    expect(source).toContain("<V3Screen>");
    expect(source).toContain("<V3ScreenHeader");
    expect(source).toContain("projection.liveAction ?");
    expect(source).not.toMatch(/Date\.now|new Date|setInterval|WebSocket|EventSource/);
  });
});
