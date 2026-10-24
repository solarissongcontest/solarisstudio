import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const fallback = () => source("src/routes/prediction-league/index.tsx");
const runtime = () => source("src/lib/v3-predictions-runtime.ts");
const adapter = () => source("src/lib/prediction-league-data.ts");

describe("V3 Prediction League fallback convergence", () => {
  it("keeps the installed V3 product merged into Predictions", () => {
    const code = fallback();
    expect(code).toContain('<Navigate to="/predictions" replace />');
    expect(code).toContain("rollout.data?.enabled === true");
    expect(code).toContain("<LegacyPredictionLeaguePage />");
  });

  it("keeps the reversible fallback on the shared V3 league adapter", () => {
    const code = fallback();
    expect(code).toContain("useV3PredictionLeagueEnabled(true)");
    expect(code).toContain("useV3PredictionLeagueStandings(");
    expect(code).toContain("type V3PredictionStanding");
    expect(code).toContain('editionId === "all" ? null : editionId');
    expect(code).not.toContain("type Standing =");
    expect(code).not.toContain("integrations/supabase");
    expect(code).not.toContain("prediction_league_leaderboard");
    expect(code).not.toContain("isStudio2FeatureEnabled");
  });

  it("keeps one canonical public RPC adapter for standings", () => {
    expect(runtime()).toContain("usePredictionLeagueStandings");
    expect(runtime()).not.toContain("integrations/supabase");
    expect(adapter()).toContain('rpc("prediction_league_leaderboard"');
    expect(adapter()).toContain("_edition_id: editionId");
  });

  it("preserves historical edition scope and public-only presentation", () => {
    const code = fallback();
    expect(code).toContain('<option value="all">All scored editions</option>');
    expect(code).toContain("published.map((edition)");
    expect(code).toContain("PublicResponsiveDataView");
    expect(code).toContain("privacy-safe public standings");
  });

  it("distinguishes rollout read failure from a canonical disabled state", () => {
    const code = fallback();
    expect(code).toContain("feature.isError ? (");
    expect(code).toContain("Prediction League is temporarily unavailable");
    expect(code).toContain("not proof that the league is disabled");
    expect(code).toContain("feature.refetch()");
    expect(code).toContain("Retry availability check");
    expect(code.indexOf("feature.isError ? (")).toBeLessThan(code.indexOf("feature.data !== true ? ("));
  });

  it("provides focused standings recovery without resetting the selected edition", () => {
    const code = fallback();
    expect(code).toContain("standings.isError ? (");
    expect(code).toContain("Your edition filter is preserved.");
    expect(code).toContain("standings.refetch()");
    expect(code).toContain("Retry standings");
    expect(code).toContain('value={editionId}');
  });
});
