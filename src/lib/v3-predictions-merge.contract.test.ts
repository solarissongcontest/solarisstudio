import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const hub = () => read("src/components/v3/V3PredictionsScreen.tsx");
const arena = () => read("src/routes/predictions/index.tsx");
const league = () => read("src/routes/prediction-league/index.tsx");
const my = () => read("src/routes/_authenticated/my-solaris/predictions.tsx");
const runtime = () => read("src/lib/v3-predictions-runtime.ts");
const projection = () => read("src/lib/v3-predictions.ts");

describe("V3 Predictions + Prediction League merge", () => {
  it("uses /predictions as the installed-app merged product", () => {
    expect(arena()).toContain("<V3PredictionsScreen />");
    expect(arena()).toContain("rollout.data?.enabled === true");
    expect(league()).toContain('<Navigate to="/predictions" replace />');
    expect(my()).toContain('<Navigate to="/predictions" replace />');
  });

  it("keeps public and rollout-failure fallbacks reversible", () => {
    expect(arena()).toContain("<LegacyPredictionArenaPage />");
    expect(league()).toContain("<LegacyPredictionLeaguePage />");
    expect(arena()).toContain("!rollout.isError");
    expect(league()).toContain("!rollout.isError");
  });

  it("shows canonical round states, personal history, scoring basis and league position together", () => {
    const code = hub();
    expect(code).toContain('title="Prediction rounds"');
    expect(code).toContain('title="Your prediction history"');
    expect(code).toContain('title="Prediction League"');
    expect(code).toContain("Scoring basis · version");
    expect(code).toContain("Your public position");
    expect(code).toContain("leaderboard_opt_in !== true");
  });

  it("reads public standings from the canonical leaderboard RPC", () => {
    expect(runtime()).toContain('rpc("prediction_league_leaderboard"');
    expect(runtime()).toContain('isStudio2FeatureEnabled("prediction_league")');
  });

  it("does not use browser time as V3 prediction state authority", () => {
    expect(projection()).not.toContain("Date.now");
    expect(projection()).not.toContain("new Date");
    expect(hub()).not.toContain("Date.now");
    expect(hub()).not.toContain("setInterval");
  });

  it("does not invent an archived state absent from the canonical backend", () => {
    expect(projection()).not.toContain('"archived"');
  });
});
