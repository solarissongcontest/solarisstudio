import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3PredictionsScreen.tsx"), "utf8");

describe("V3 Predictions read recovery", () => {
  it("fails closed on a failed round or fan-session read, and retries only failed queries", () => {
    const source = screen();
    expect(source).toContain('data-v3-predictions-state="error"');
    expect(source).toContain("rounds.isError || session.isError ? (");
    expect(source).toContain("Private picks are not shown as signed out until the check succeeds");
    expect(source).toContain("disabled={rounds.isFetching || session.isFetching}");
    expect(source).toContain("if (rounds.isError) void rounds.refetch()");
    expect(source).toContain("if (session.isError) void session.refetch()");
    expect(source).toContain("if (session.isError) void session.refetch();\\n              }}".replace("\\n", "\n"));
    expect(source).toContain("Retry prediction state");
  });

  it("does not treat a failed profile read as a voluntary leaderboard opt-out", () => {
    const source = screen();
    expect(source).toContain("session.data && profile.isError");
    expect(source).toContain("Your leaderboard privacy setting could not be checked.");
    expect(source).toContain("onClick={() => void profile.refetch()}");
    expect(source).toContain("disabled={profile.isFetching}");
    expect(source).toContain("Retry privacy setting");
  });

  it("withholds misleading Open/Submitted round cards until a signed-in fan's history is verified", () => {
    const source = screen();
    const title = source.indexOf('<V3Section title="Prediction rounds"');
    const cards = source.indexOf('active.map((round)', title);
    const guard = source.indexOf("viewerId && history.isLoading ? (", title);
    const failure = source.indexOf("viewerId && history.isError ? (", title);
    expect(title).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(title);
    expect(failure).toBeGreaterThan(guard);
    expect(cards).toBeGreaterThan(failure);
    expect(source).toContain('data-v3-prediction-rounds-state="private-history-error"');
    expect(source).toContain("Your submitted prediction states could not be verified.");
    expect(source).toContain("Retry saved predictions");
    expect(source).toContain("onClick={() => void history.refetch()}");
  });

  it("makes private-history failure recoverable without substituting anonymous state", () => {
    const source = screen();
    expect(source).toContain('data-v3-prediction-history-state="error"');
    expect(source).toContain("disabled={history.isFetching}");
    expect(source).toContain("onClick={() => void history.refetch()}");
    expect(source).toContain("Retry prediction history");
  });

  it("distinguishes a failed feature-availability request from an actual disabled rollout", () => {
    const source = screen();
    expect(source).toContain("leagueFeature.isError ? (");
    expect(source).toContain('data-v3-prediction-league-state="error"');
    expect(source).toContain("disabled={leagueFeature.isFetching}");
    expect(source).toContain("onClick={() => void leagueFeature.refetch()}");
    expect(source).toContain('data-v3-prediction-league-state="unavailable"');
  });

  it("retries the selected edition's standings without displaying unverified rankings", () => {
    const source = screen();
    expect(source).toContain('data-v3-prediction-league-state="standings-error"');
    expect(source).toContain("disabled={standings.isFetching}");
    expect(source).toContain("onClick={() => void standings.refetch()}");
    expect(source).toContain("Retry standings");
    expect(source.indexOf(") : standings.isError ? (")).toBeLessThan(
      source.indexOf('(standings.data ?? []).slice(0, 10)'),
    );
  });

  it("does not mistake offline paused first reads for signed-out, empty or submitted state", () => {
    const source = screen();
    expect(source).toContain("rounds.isPending && rounds.isPaused");
    expect(source).toContain("session.isPending && session.isPaused");
    expect(source).toContain('data-v3-predictions-state="paused"');
    expect(source).toContain("No signed-out or empty-state conclusion is being made.");
    expect(source).toContain("if (rounds.isPending) void rounds.refetch()");
    expect(source).toContain("if (session.isPending) void session.refetch()");
    expect(source.indexOf('data-v3-predictions-state="paused"')).toBeLessThan(
      source.indexOf("rounds.isLoading || session.isLoading ? ("),
    );

    expect(source).toContain("viewerId && history.isPending && history.isPaused");
    expect(source).toContain('data-v3-prediction-rounds-state="paused"');
    expect(source).toContain('data-v3-prediction-history-state="paused"');
    expect(source.indexOf('data-v3-prediction-rounds-state="paused"')).toBeLessThan(
      source.indexOf("active.map((round)"),
    );
  });

  it("withholds paused unverified league reads and privacy settings instead of inventing absence", () => {
    const source = screen();
    expect(source).toContain("leagueFeature.isPending && leagueFeature.isPaused");
    expect(source).toContain('data-v3-prediction-league-state="paused"');
    expect(source).toContain("standings.isPending && standings.isPaused");
    expect(source).toContain('data-v3-prediction-league-state="standings-paused"');
    expect(source).toContain('session.data && profile.isPending');
    expect(source).toContain("Your leaderboard privacy setting has not been verified.");
    expect(source).toContain("profile.isError || (profile.isPending && profile.isPaused)");
    expect(source).toContain("onClick={() => void profile.refetch()}");
    expect(source.indexOf('data-v3-prediction-league-state="paused"')).toBeLessThan(
      source.indexOf('data-v3-prediction-league-state="unavailable"'),
    );
    expect(source.indexOf('data-v3-prediction-league-state="standings-paused"')).toBeLessThan(
      source.indexOf('(standings.data ?? []).slice(0, 10)'),
    );
  });

});
