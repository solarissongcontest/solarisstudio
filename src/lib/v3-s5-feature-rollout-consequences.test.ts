import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261018091500_v3_s5_feature_rollout_authority.sql",
);
const route = source("src/routes/_authenticated/admin/feature-rollout.tsx");
const rehearsal = source(
  ".github/scripts/v3-s5-feature-rollout-consequences-rehearsal.sh",
);

describe("System V3 S5 Feature Rollout authority", () => {
  it("adds a monotonic rollout revision and normalized scope semantics", () => {
    expect(migration).toContain("add column if not exists revision bigint not null default 1");
    expect(migration).toContain("studio2_feature_flags_revision_check");
    expect(migration).toContain("private.v3_normalize_rollout_uuid_array");
    expect(migration).toContain("select distinct value");
    expect(migration).toContain("array_agg(value order by value)");
  });

  it("moves authenticated rollout mutation behind the canonical S2 operation contract", () => {
    expect(migration).toContain("public.studio2_feature_flag_change_preview");
    expect(migration).toContain("public.studio2_apply_feature_flag_change");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'rollout.change'");
    expect(migration).toContain("'R1'");
    expect(migration).toContain("p_expected_revision");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("private.studio2_complete_operation");
  });

  it("preserves scoped rollout.manage authorization across existing and requested edition scopes", () => {
    expect(migration).toContain("private.v3_rollout_manage_allowed");
    expect(migration).toContain("v_existing || v_requested");
    expect(migration).toContain("public.studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).toContain(
      "public.studio2_access_allowed('rollout.manage', affected.edition_id, false)",
    );
  });

  it("preserves rollout as an authenticated operational recovery control in restrictive platform modes", () => {
    const mutationGuardStart = migration.indexOf(
      "create or replace function private.studio2_platform_mutation_allowed",
    );
    const previewStart = migration.indexOf(
      "create or replace function public.studio2_feature_flag_change_preview",
    );
    const guard = migration.slice(mutationGuardStart, previewStart);
    expect(guard).toContain("when 'read_only' then");
    expect(guard).toContain("when 'maintenance' then");
    expect(guard.match(/'rollout\.change'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("emits one versioned privacy-safe rollout.changed fact only after semantic mutation", () => {
    expect(migration).toContain("revision = revision + 1");
    expect(migration).toContain("'rollout.changed'");
    expect(migration).toContain("'feature_rollout'");
    expect(migration).toContain("v_after.revision");
    expect(migration).toContain("array[]::text[]");

    const emitStart = migration.indexOf("perform private.v3_emit_domain_event(");
    const resultStart = migration.indexOf("v_result := jsonb_build_object(", emitStart);
    const emitted = migration.slice(emitStart, resultStart);
    expect(emitted).toContain("'userTargetCount'");
    expect(emitted).toContain("'editionTargetCount'");
    expect(emitted).not.toContain("'userIds'");
    expect(emitted).not.toContain("'editionIds'");
  });

  it("keeps the old Organizer RPC only as an authenticated compatibility adapter", () => {
    expect(route).toContain("client.rpc('studio2_set_feature_flag'");
    expect(migration).toContain("create or replace function public.studio2_set_feature_flag(");
    expect(migration).toContain("if coalesce((v_preview ->> 'noChange')::boolean, false) then");
    expect(migration).toContain("public.studio2_apply_feature_flag_change(");
    expect(migration).toContain(
      "revoke all on function public.studio2_set_feature_flag(\n  text, boolean, boolean, uuid[], uuid[]\n) from public, anon, service_role;",
    );
    expect(migration).toContain("to authenticated;");
  });

  it("closes anonymous service-role rollout writers so every runtime event has actor provenance", () => {
    expect(migration).toContain(
      "revoke insert, update, delete, truncate, references, trigger\n  on table public.studio2_feature_flags\n  from service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_apply_feature_flag_change(",
    );
    expect(migration).toContain("from public, anon, service_role;");
  });

  it("keeps rollout.changed unpromoted until stacked runtime evidence is merged", () => {
    expect(v3DomainConsequence("rollout.changed")?.implementationState).toBe("declared");
  });

  it("keeps hostile proof local-only and covers no-op, replay, CAS, authorization and privacy", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("Equivalent reordered scope is a true no-op");
    expect(rehearsal).toContain("exact rollout operation did not replay");
    expect(rehearsal).toContain("stale rollout CAS");
    expect(rehearsal).toContain("unauthorized rollout preview");
    expect(rehearsal).toContain("rollout event leaked targeted user identifiers");
    expect(rehearsal).toContain("service_role still has direct rollout UPDATE authority");
  });
});
