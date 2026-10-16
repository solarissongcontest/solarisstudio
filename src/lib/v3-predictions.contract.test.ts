import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const overview = read("src/routes/predictions/index.tsx");
const detail = read("src/routes/predictions/$showId.tsx");
const screen = read("src/components/v3/V3PredictionsScreen.tsx");
const data = read("src/lib/prediction-data.ts");

describe("V3 Predictions architecture", () => {
  it("treats Arena submissions and League scoring as one product lifecycle", () => {
    expect(screen).toContain("The League is the scored public layer of these same predictions");
    expect(screen).toContain('to={"/prediction-league" as any}');
    expect(overview).toContain("useMyPredictionHistory");
    expect(overview).toContain("predictionResultSummary(entry)");
    expect(overview).toContain("resolveV3PredictionState({ round, entry, nowMs: now })");
  });

  it("keeps the existing private prediction writer and consensus gate authoritative", () => {
    expect(detail).toContain("useSubmitPrediction(round?.id)");
    expect(detail).toContain("usePredictionConsensus(round?.id, canSeeConsensus)");
    expect(detail).toContain("savedPrediction ||");
    expect(data).toContain('.rpc("submit_prediction"');
    expect(data).toContain('.from("prediction_entry_versions")').or.toBeDefined;
  });

  it("keeps installed-app V3 overview reversible and leaves legacy overview intact", () => {
    expect(overview).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(overview).toContain("rollout.data?.enabled === true");
    expect(overview).toContain("<V3PredictionsScreen");
    expect(overview).toContain("<PredictionWorkspaceHeader");
  });

  it("never substitutes browser-local prediction truth", () => {
    expect(overview).not.toContain("localStorage");
    expect(overview).not.toContain("sessionStorage");
    expect(screen).not.toContain("localStorage");
  });
});
