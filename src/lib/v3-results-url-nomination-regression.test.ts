import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 result URL nomination hardening", () => {
  it("bounds every browser-nominated result show before a server validator sees it", () => {
    const resultsGate = read("src/components/v3/V3ResultsRootGate.tsx");
    const broadcastGate = read("src/components/v3/V3BroadcastIntelligenceGate.tsx");
    const resultLabGate = read("src/components/v3/V3ResultLabGate.tsx");

    expect(resultsGate).toContain("MAX_RESULTS_SHOW_NOMINATION_LENGTH = 120");
    expect(resultsGate).toContain(".slice(0, MAX_RESULTS_SHOW_NOMINATION_LENGTH)");
    expect(broadcastGate).toContain("MAX_SHOW_NOMINATION_LENGTH = 120");
    expect(broadcastGate).toContain(".slice(0, MAX_SHOW_NOMINATION_LENGTH)");
    expect(resultLabGate).toContain("MAX_SHOW_NOMINATION_LENGTH = 120");
    expect(resultLabGate).toContain(".slice(0, MAX_SHOW_NOMINATION_LENGTH)");
  });

  it("lets malformed Results nominations reach canonical server revalidation without granting authority", () => {
    const resultsFunctions = read("src/lib/v3-results.functions.ts");
    const resultsSource = read("src/integrations/v3/results-source.server.ts");
    const resultsGate = read("src/components/v3/V3ResultsRootGate.tsx");

    expect(resultsFunctions).toContain("z.string().trim().min(1).max(120).nullable().optional()");
    expect(resultsSource).toContain(
      "resultShows.find((show) => show.id === requestedShowId) ?? resultShows[0] ?? null",
    );
    expect(resultsGate).toContain("nomination.showId !== selectedShowId");
    expect(resultsGate).toContain("replace: true");
  });
});
