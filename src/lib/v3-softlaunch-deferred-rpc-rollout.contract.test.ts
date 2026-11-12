import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const candidate = read(
  "docs/v3/recovery-candidates/forward-only-softlaunch-deferred-rpc-rollout-local.sql",
);
const fantasySource = read(
  "supabase/migrations/20260920104806_completion_products.sql",
);
const predictionSource = read(
  "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
);

function effectiveFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const grant = source.indexOf(`grant execute on function public.${name}(`, start);
  expect(start, `Missing canonical ${name} definition`).toBeGreaterThanOrEqual(0);
  expect(grant, `Missing ${name} ACL`).toBeGreaterThan(start);
  return source.slice(start, source.indexOf(";", grant) + 1);
}

function withoutGuard(input: string, feature: "FANTASY" | "PREDICTION") {
  const guard = new RegExp(
    `\\n  -- BEGIN SOFT-LAUNCH ${feature} ROLLOUT GUARD\\n[\\s\\S]*?\\n  -- END SOFT-LAUNCH ${feature} ROLLOUT GUARD\\n`,
  );
  expect(input).toMatch(guard);
  return input.replace(guard, "");
}

describe("V3 deferred RPC rollout candidate (local-only, not release-certified)", () => {
  it("is inert without explicit isolated rehearsal and refuses absent or competing authorities", () => {
    expect(candidate).toContain("LOCAL REHEARSAL ONLY");
    expect(candidate).toContain("NOT A TRACKED MIGRATION");
    expect(candidate).toContain("set local lock_timeout = '5s'");
    expect(candidate).toContain("set local statement_timeout = '120s'");
    expect(candidate).toContain("to_regprocedure('private.studio2_feature_enabled_for(uuid,text,uuid)')");
    expect(candidate).toContain("to_regprocedure('public.submit_fantasy_team(uuid,uuid[],uuid)')");
    expect(candidate).toContain("to_regprocedure('public.submit_prediction(uuid,jsonb)')");
    expect(candidate).toContain("newer Fantasy writer needs separate rollout review");
    expect(candidate).not.toMatch(/alter\s+table|drop\s+table|truncate\s+table/i);
    expect(candidate).not.toMatch(/insert\s+into\s+(?:supabase_migrations|public\.studio2_feature_flags)/i);
  });

  it("preserves the complete pre-existing Fantasy function and ACL except the new guard", () => {
    const original = effectiveFunction(fantasySource, "submit_fantasy_team");
    const staged = effectiveFunction(candidate, "submit_fantasy_team");
    expect(withoutGuard(staged, "FANTASY")).toBe(original);
    const guard = staged.indexOf("-- BEGIN SOFT-LAUNCH FANTASY ROLLOUT GUARD");
    expect(guard).toBeGreaterThan(staged.indexOf("if v_game.id is null"));
    expect(guard).toBeLessThan(staged.indexOf("update public.fantasy_games"));
    expect(staged).toContain("private.studio2_feature_enabled_for(v_user, 'fantasy_ssc', v_game.edition_id)");
    expect(staged).toContain("v_game.edition_id is null");
    expect(staged).toContain("errcode = '42501'");
    expect(staged).toContain("to authenticated, service_role;");
  });

  it("preserves Prediction validation, replay rules and ACL except the new guard and edition variable", () => {
    const original = effectiveFunction(predictionSource, "submit_prediction");
    const staged = effectiveFunction(candidate, "submit_prediction");
    const cleaned = withoutGuard(staged, "PREDICTION").replace("  v_edition_id uuid;\n", "");
    expect(cleaned).toBe(original);
    const guard = staged.indexOf("-- BEGIN SOFT-LAUNCH PREDICTION ROLLOUT GUARD");
    expect(guard).toBeGreaterThan(staged.indexOf("if round_row.id is null"));
    expect(guard).toBeLessThan(staged.indexOf("if round_row.status <> 'open'"));
    expect(staged).toContain("from public.shows show_row");
    expect(staged).toContain("where show_row.id = round_row.show_id");
    expect(staged).toContain("v_edition_id is null");
    expect(staged).toContain("current_user_id, 'prediction_league', v_edition_id");
    expect(staged).toContain("errcode = '42501'");
    expect(staged).toContain("to authenticated, service_role;");
  });

  it("does not invent feature flags, an additional writer or production-only bypass", () => {
    expect(candidate.match(/create or replace function public\./g)).toHaveLength(2);
    expect(candidate).not.toContain("create or replace function public.v3_submit_fantasy_team(");
    expect(candidate).not.toContain("create table ");
    expect(candidate).not.toContain("create policy ");
    expect(candidate).not.toContain("service_role' then");
    expect(candidate).not.toContain("studio2_set_feature_flag(");
  });
});
