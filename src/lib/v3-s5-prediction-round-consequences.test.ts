import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017113000_v3_s5_prediction_round_consequences.sql",
);
const client = source("src/lib/prediction-data.ts");
const rehearsal = source(
  ".github/scripts/v3-s5-prediction-round-consequences-rehearsal.sh",
);

describe("System V3 S5 Prediction round consequences", () => {
  it("moves round concurrency into a server-owned revision table", () => {
    expect(migration).toContain("create table if not exists public.studio2_prediction_round_versions");
    expect(migration).toContain("version bigint not null default 1 check (version >= 1)");
    expect(migration).toContain(
      "revoke all on table public.studio2_prediction_round_versions from public, anon, authenticated",
    );
    expect(migration).toContain("grant all on table public.studio2_prediction_round_versions to service_role");
  });

  it("exposes capability-checked config/delete previews", () => {
    expect(migration).toContain("public.studio2_prediction_round_config_preview");
    expect(migration).toContain("public.studio2_prediction_round_delete_preview");
    expect(migration).toContain("public.studio2_access_allowed('voting.manage'");
    expect(migration).toContain("'roundVersion', v_version");
  });

  it("routes semantic saves through operation receipts and optimistic versions", () => {
    expect(migration).toContain("public.studio2_save_prediction_round");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("p_expected_round_version");
    expect(migration).toContain("Prediction round changed since this preview was loaded");
    expect(migration).toContain("private.v3_prediction_types_canonical");
    expect(migration).toContain("v_action := case");
    expect(migration).toContain("when not v_changed then 'noop'");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
  });

  it("keeps scorer-owned states out of configuration writes", () => {
    expect(migration).toContain("p_status not in ('draft', 'open', 'locked', 'cancelled')");
    expect(migration).toContain("Prediction scoring states are owned by the scoring command");
    expect(migration).toContain("v_round.status in ('scoring', 'scored')");
  });

  it("makes draft deletion a versioned operation and protects saved entries", () => {
    expect(migration).toContain("public.studio2_delete_prediction_round");
    expect(migration).toContain("Only a draft Prediction round can be deleted");
    expect(migration).toContain("A Prediction round with saved entries cannot be deleted");
    expect(migration).toContain("'action', 'delete'");
  });

  it("emits prediction.changed only from successful changed operations", () => {
    expect(migration).toContain("new.command not in ('prediction.configure', 'prediction.lock', 'prediction.publish')");
    expect(migration).toContain("coalesce((new.result ->> 'changed')::boolean, false) is false");
    expect(migration).toContain("'prediction.changed'");
    expect(migration).toContain("'prediction_round'");
    expect(migration).toContain("v_round_version");
    expect(migration).toContain("array[]::text[]");
  });

  it("removes direct authenticated round writes and cuts shared client hooks over to preview/apply", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.prediction_rounds from authenticated",
    );
    expect(client).toMatch(/\.rpc\(\s*"studio2_prediction_round_config_preview"/);
    expect(client).toMatch(/\.rpc\(\s*"studio2_save_prediction_round"/);
    expect(client).toMatch(/\.rpc\(\s*"studio2_prediction_round_delete_preview"/);
    expect(client).toMatch(/\.rpc\(\s*"studio2_delete_prediction_round"/);
    expect(client).toContain("p_expected_round_version: preview.roundVersion");
    expect(client).not.toContain('.from("prediction_rounds")\n        .upsert(');
    expect(client).not.toContain('.from("prediction_rounds").delete()');
  });

  it("does not claim a Prediction task reconciler that does not exist", () => {
    expect(v3DomainConsequence("prediction.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("prediction.changed")?.taskEffects).toEqual([]);
  });

  it("rehearses create, no-op, stale conflict, publish, lock, direct-write denial and delete locally", () => {
    expect(rehearsal).toContain("created round revision is not 1");
    expect(rehearsal).toContain("semantic no-op advanced round revision");
    expect(rehearsal).toContain("stale round revision unexpectedly succeeded");
    expect(rehearsal).toContain("published round revision is not 2");
    expect(rehearsal).toContain("locked round revision is not 3");
    expect(rehearsal).toContain("direct prediction_rounds update remains browser-writable");
    expect(rehearsal).toContain("deleted round did not emit terminal prediction.changed");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
