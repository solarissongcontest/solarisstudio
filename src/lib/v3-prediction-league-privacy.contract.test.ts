import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = () =>
  readFileSync(
    "supabase/migrations/20261002200000_organisation_os_v5_community_moderation.sql",
    "utf8",
  );
const adapter = () => readFileSync("src/lib/prediction-league-data.ts", "utf8");
const screen = () => readFileSync("src/components/v3/V3PredictionsScreen.tsx", "utf8");

describe("V3 Prediction League privacy boundary", () => {
  it("publishes only explicit public opt-in identities that are not moderation-hidden", () => {
    const sql = migration();

    expect(sql).toContain("where profile.visibility = 'public'");
    expect(sql).toContain("and profile.leaderboard_opt_in = true");
    expect(sql).toContain("and profile.moderation_hidden_at is null");
  });

  it("includes only scored rounds whose edition and result projection are public", () => {
    const sql = migration();

    expect(sql).toContain("and round.status = 'scored'");
    expect(sql).toContain("and edition.published = true");
    expect(sql).toContain("and public.show_publication_enabled(round.show_id, 'results')");
  });

  it("exposes aggregate score identity rather than private prediction picks", () => {
    const sql = migration();
    const rpcStart = sql.indexOf("create or replace function public.prediction_league_leaderboard(");
    const rpcEnd = sql.indexOf("create or replace function public.shared_prediction", rpcStart);
    const rpc = sql.slice(rpcStart, rpcEnd);

    expect(rpc).toContain('"displayName" text');
    expect(rpc).toContain("score numeric");
    expect(rpc).toContain("rounds bigint");
    expect(rpc).not.toContain("prediction_type");
    expect(rpc).not.toContain("confidence");
    expect(rpc).not.toContain("countryId");
  });

  it("keeps the V3 client on the public leaderboard RPC and explains opt-in state", () => {
    expect(adapter()).toContain('rpc("prediction_league_leaderboard"');
    expect(screen()).toContain("leaderboard_opt_in !== true");
    expect(screen()).toContain("Your public position");
  });
});
