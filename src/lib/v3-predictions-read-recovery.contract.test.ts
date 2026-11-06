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
});
