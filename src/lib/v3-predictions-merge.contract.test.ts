import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { publicLaunchAllows } from "./public-launch-availability";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const hub = () => read("src/components/v3/V3PredictionsScreen.tsx");
const boundary = () => read("src/components/v3/V3PredictionsRouteContent.tsx");
const arena = () => read("src/routes/predictions/index.tsx");
const league = () => read("src/routes/prediction-league/index.tsx");
const my = () => read("src/routes/_authenticated/my-solaris/predictions.tsx");
const runtime = () => read("src/lib/v3-predictions-runtime.ts");
const dataAdapter = () => read("src/lib/prediction-league-data.ts");
const projection = () => read("src/lib/v3-predictions.ts");

describe("V3 Predictions + Prediction League merge", () => {
  it("preserves the V3 merged Predictions implementation while the soft launch defers its route", () => {
    expect(arena()).toContain("<V3PredictionsRouteContent />");
    expect(boundary()).toContain("<V3PredictionsScreen />");
    expect(arena()).toContain("rollout.data?.enabled === true");
    // Prediction League can be opted in without authorizing the broader Arena.
    expect(league()).not.toContain('<Navigate to="/predictions" replace />');
    expect(league()).toContain("return <LegacyPredictionLeaguePage />;");
    expect(publicLaunchAllows("/prediction-league", { prediction_league: true })).toBe(true);
    expect(publicLaunchAllows("/predictions", { prediction_league: true })).toBe(false);
    expect(my()).toContain('<Navigate to="/predictions" replace />');
  });

  it("keeps public and rollout-failure fallbacks reversible", () => {
    expect(arena()).toContain("<LegacyPredictionArenaPage />");
    expect(league()).toContain("<LegacyPredictionLeaguePage />");
    expect(arena()).toContain("!rollout.isError");
    // League remains a separately verified read surface when the V3 Arena is withheld.
    expect(league()).toContain("feature.isError || feature.data !== true");
    expect(league()).toContain("enabled: feature.data === true");
    expect(league()).not.toContain("useV3RolloutProbe");
  });

  it("does not project a signed-in user's round state until private submission history is authoritative", () => {
    const code = boundary();
    expect(code).toContain("useMyPredictionHistory(viewerId ?? undefined)");
    expect(code).toContain("viewerId && history.isLoading");
    expect(code).toContain("viewerId && history.isError");
    expect(code).toContain('data-v3-predictions-private-state="error"');
    expect(code).toContain("will not show a round as open or unsubmitted");
    expect(code.indexOf("privateStateLoading || privateStateFailed")).toBeLessThan(
      code.indexOf("<V3PredictionsScreen />"),
    );
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

  it("reads public standings through the canonical data adapter", () => {
    expect(dataAdapter()).toContain('rpc("prediction_league_leaderboard"');
    expect(dataAdapter()).toContain("_edition_id: editionId");
    expect(runtime()).toContain("usePredictionLeagueStandings");
    expect(runtime()).toContain('isStudio2FeatureEnabled("prediction_league")');
    expect(runtime()).not.toContain("integrations/supabase");
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