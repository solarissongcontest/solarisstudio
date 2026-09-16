import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_prediction_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("Prediction RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Prediction RPC Permission Engine cutover", () => {
  it("uses guarded pg_get_functiondef rewrites instead of copying Prediction business logic", () => {
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("v_after := replace(v_before, v_legacy, v_replacement)");
    expect(migration).toContain("v_after := replace(v_before, v_score_legacy, v_score_replacement)");
    expect(migration).toContain("if v_occurrences <> 2 then");
    expect(migration).toContain("if v_occurrences <> 1 then");
  });

  it("moves both hidden-consensus Organizer bypasses to edition-scoped non-strict voting.manage", () => {
    expect(migration).toContain(
      "public.studio2_access_allowed(\\'voting.manage\\', (select s.edition_id from public.shows s where s.id = round_row.show_id), false)",
    );
    expect(migration).toContain("array['prediction_consensus', 'prediction_consensus_movement']");
    expect(migration).toContain("expected 2 occurrences");
  });

  it("keeps scoring authorization before the existing locked-row lookup while resolving edition scope", () => {
    const sql = normalized(migration);
    expect(sql).toContain("if current_user_id is null\\n or not public.studio2_access_allowed(");
    expect(sql).toContain("select s.edition_id\\n from public.prediction_rounds pr\\n join public.shows s on s.id = pr.show_id\\n where pr.id = _round_id");
    expect(migration).toContain("score_prediction_round legacy authorization source drifted");
  });

  it("verifies resulting definitions contain no direct legacy role checks", () => {
    expect(migration).toContain("if v_after ilike '%public.has_role(%' then");
    expect(migration).toContain("cutover still contains public.has_role");
  });

  it("preserves authenticated/service execution and keeps anonymous execution closed", () => {
    const sql = normalized(migration);
    expect(sql).toContain("revoke all on function public.prediction_consensus(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.prediction_consensus(uuid) to authenticated, service_role;");
    expect(sql).toContain("revoke all on function public.prediction_consensus_movement(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.prediction_consensus_movement(uuid) to authenticated, service_role;");
    expect(sql).toContain("revoke all on function public.score_prediction_round(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.score_prediction_round(uuid) to authenticated, service_role;");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
