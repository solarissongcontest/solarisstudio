import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_prediction_leaf_cutover.sql"),
);
if (!migrationName) throw new Error("Prediction Arena leaf cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Prediction Arena Permission Engine leaf cutover", () => {
  it("targets exactly the three remaining Prediction Arena legacy-role functions", () => {
    const sql = normalized(migration);
    for (const name of [
      "prediction_consensus",
      "prediction_consensus_movement",
      "score_prediction_round",
    ]) {
      expect(sql).toContain(`'${name}'`);
    }
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid) = '_round_id uuid'");
  });

  it("uses a guarded source-preserving rewrite instead of duplicating scoring logic", () => {
    expect(migration).toContain("pg_get_functiondef(v_oid)");
    expect(migration).toContain("v_after := replace(v_before, v_legacy, v_replacement)");
    expect(migration).toContain("authorization source clause drifted");
    expect(migration).toContain("authorization rewrite made no change");
    expect(migration).toContain("legacy Organizer predicate remains after rewrite");
    expect(migration).not.toContain("delete from public.prediction_scores");
    expect(migration).not.toContain("capture_prediction_consensus_snapshot(_round_id)");
  });

  it("maps every elevated Prediction path to edition-scoped non-strict voting.manage", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "public.studio2_access_allowed(''voting.manage'', (select s.edition_id from public.prediction_rounds pr join public.shows s on s.id = pr.show_id where pr.id = _round_id), false)",
    );
    expect(migration).toContain(
      "public.has_role(current_user_id, ''organizer''::public.app_role)",
    );
    expect(migration).toContain("replace(v_before, v_legacy, v_replacement)");
  });

  it("does not use broad viewer-class read capabilities for private consensus", () => {
    expect(migration).not.toContain("studio2_access_allowed(''voting.read''");
    expect(migration).not.toContain("studio2_access_allowed(''edition.read''");
  });

  it("preserves authenticated/service execution and keeps anonymous closed", () => {
    const sql = normalized(migration);
    for (const signature of [
      "public.prediction_consensus(uuid)",
      "public.prediction_consensus_movement(uuid)",
      "public.score_prediction_round(uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated, service_role;`);
    }
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
