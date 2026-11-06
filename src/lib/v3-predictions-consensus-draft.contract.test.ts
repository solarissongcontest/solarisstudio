import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/routes/predictions/$showId.tsx"), "utf8");

describe("Prediction draft consensus boundary", () => {
  it("does not request community consensus for an unsubmitted saved draft", () => {
    const route = source();
    expect(route).toContain('import { hasSubmittedPrediction } from "@/lib/v3-predictions"');
    expect(route).toContain("hasSubmittedPrediction(savedPrediction)");
    expect(route).not.toContain("(savedPrediction ||");
    expect(route).toContain("const { data: consensus } = usePredictionConsensus(round?.id, canSeeConsensus)");
  });

  it("preserves the existing authenticated post-lock route to consensus", () => {
    const route = source();
    expect(route).toContain("user &&");
    expect(route).toContain("round && now != null && now >= new Date(round.locks_at).getTime()");
  });
});
