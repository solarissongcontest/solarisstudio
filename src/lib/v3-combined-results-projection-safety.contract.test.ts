import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018234000_v3_combined_results_projection_safety.sql",
  ),
  "utf8",
);

describe("System V3 Combined retained publication projection safety", () => {
  it("treats a retained #734 projection as publication evidence", () => {
    expect(migration).toContain("v_detail -> 'solarisProjection' is not null");
    expect(migration).toContain("jsonb_typeof(v_detail -> 'solarisProjection') = 'object'");
    expect(migration).toContain("published_projection_requires_withdrawal");
  });

  it("fails source/config/destructive mutations closed while a published projection is retained", () => {
    expect(migration).toContain(
      "v_action in ('configure', 'participants', 'source', 'values', 'unlock', 'delete')",
    );
    expect(migration).toContain("v_can_commit := false");
    expect(migration).toContain("'withdrawalRequiredBeforeSourceMutation'");
  });

  it("still allows the supersession path through recalculate, lock and publish", () => {
    expect(migration).toContain(
      "v_action in ('recalculate', 'lock', 'publish')",
    );
    expect(migration).toContain("'supersessionOrReconciliationRequired'");
    expect(migration).not.toContain(
      "v_projection_present\n     and v_action in ('recalculate', 'lock', 'publish') then\n    v_can_commit := false",
    );
  });

  it("preserves normal lifecycle blockers and exact CAS evidence", () => {
    expect(migration).toContain("'immutable_status'");
    expect(migration).toContain("'recalculation_required'");
    expect(migration).toContain("'lock_required'");
    expect(migration).toContain("'participant_binding_not_current'");
    expect(migration).toContain("'not_locked_or_published'");
    expect(migration).toContain("'published_result_cannot_delete'");
    expect(migration).toContain("'configVersion'");
    expect(migration).toContain("'stateVersion'");
    expect(migration).toContain("'calculationVersion'");
  });

  it("keeps preflight stable, observational and authenticated-only", () => {
    expect(migration).toContain("returns jsonb\nlanguage plpgsql\nstable\nsecurity definer");
    expect(migration).not.toMatch(/\binsert\s+into\b/i);
    expect(migration).not.toMatch(/\bupdate\s+[a-z0-9_.\"]+\s+set\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).toContain(
      "revoke all on function public.v3_combined_result_preflight(uuid, uuid, text)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_combined_result_preflight(uuid, uuid, text)\n  to authenticated, service_role;",
    );
  });

  it("is transactional and refreshes PostgREST metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});