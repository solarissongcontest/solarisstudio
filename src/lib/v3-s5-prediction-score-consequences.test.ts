import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017110000_v3_s5_prediction_score_consequences.sql",
);
const client = source("src/lib/prediction-data.ts");
const rehearsal = source(
  ".github/scripts/v3-s5-prediction-score-consequences-rehearsal.sh",
);

describe("System V3 S5 Prediction score consequences", () => {
  it("keeps score revisions in a server-owned table instead of browser-mutable round fields", () => {
    expect(migration).toContain("create table if not exists public.studio2_prediction_score_versions");
    expect(migration).toContain("version bigint not null default 0 check (version >= 0)");
    expect(migration).toContain("revoke all on table public.studio2_prediction_score_versions from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.studio2_prediction_score_versions to service_role");
    expect(migration).not.toContain("add column if not exists score_revision");
  });

  it("preserves pre-migration scored truth as revision one", () => {
    expect(migration).toContain("when round_row.status = 'scored'");
    expect(migration).toContain("join public.prediction_scores score on score.entry_id = entry.id");
    expect(migration).toContain("then 1");
  });

  it("uses a preview plus R2 idempotent optimistic score command", () => {
    expect(migration).toContain("public.studio2_prediction_score_preview");
    expect(migration).toContain("public.studio2_score_prediction_round");
    expect(migration).toContain("'prediction.score'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_expected_score_revision");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(migration).toContain("Prediction scores changed since this preview was loaded");
  });

  it("reuses the established scoring algorithm but removes its browser bypass", () => {
    expect(migration).toContain("select public.score_prediction_round(p_round_id)");
    expect(migration).toContain("revoke all on function public.score_prediction_round(uuid)");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.studio2_score_prediction_round");
  });

  it("emits prediction.scored as a separately versioned prediction_score aggregate", () => {
    expect(migration).toContain("new.command <> 'prediction.score'");
    expect(migration).toContain("'prediction.scored'");
    expect(migration).toContain("'prediction_score'");
    expect(migration).toContain("v_score_revision");
    expect(migration).toContain("v_current_revision is distinct from v_score_revision");
    expect(migration).toContain("'previousScoreRevision'");
    expect(migration).toContain("array[]::text[]");
  });

  it("does not fabricate the undeployed prediction.operation_required task consequence", () => {
    expect(v3DomainConsequence("prediction.scored")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("prediction.scored")?.ownerDomain).toBe("prediction");
    expect(v3DomainConsequence("prediction.scored")?.taskEffects).toEqual([]);
  });

  it("cuts the Organizer client over to preview then canonical apply", () => {
    expect(client).toMatch(/\.rpc\(\s*"studio2_prediction_score_preview"/);
    expect(client).toMatch(/\.rpc\(\s*"studio2_score_prediction_round"/);
    expect(client).toContain("p_expected_score_revision: preview.scoreRevision");
    expect(client).toContain("operationId = crypto.randomUUID()");
    expect(client).not.toMatch(/\.rpc\(\s*"score_prediction_round"/);
  });

  it("rehearses first score, replay, stale conflict and a second semantic score revision locally", () => {
    expect(rehearsal).toContain("first score revision is not 1");
    expect(rehearsal).toContain("exact replay duplicated prediction.scored");
    expect(rehearsal).toContain("stale score revision unexpectedly succeeded");
    expect(rehearsal).toContain("second score revision is not 2");
    expect(rehearsal).toContain("aggregate_type='prediction_score'");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
