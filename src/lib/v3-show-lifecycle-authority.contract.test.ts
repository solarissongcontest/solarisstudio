import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261019210500_v3_show_lifecycle_authority.sql",
  "utf8",
);
const client = readFileSync("src/lib/show-lifecycle-authority.ts", "utf8");

describe("V3 governed Show lifecycle authority", () => {
  it("introduces a canonical optimistic-concurrency token that legacy writes also advance", () => {
    expect(migration).toContain("add column if not exists revision bigint");
    expect(migration).toContain("create trigger v3_bump_show_revision");
    expect(migration).toContain("new.revision := old.revision + 1");
    expect(migration).toContain("v_show.revision is distinct from p_expected_revision");
    expect(migration).toContain("message = 'STATE_CHANGED'");
  });

  it("discovers destructive dependencies from the real foreign-key graph instead of a stale hand list", () => {
    expect(migration).toContain("from pg_constraint fk");
    expect(migration).toContain("ref_column.attname = 'show_id'");
    expect(migration).toContain("private.v3_show_dependency_snapshot(p_show_id)");
    expect(migration).toContain("'DEPENDENT_RECORDS_EXIST'");
    expect(migration).toContain("message = 'DEPENDENCY_BLOCKED'");
  });

  it("makes destructive deletion R3, freshly authenticated, reviewed and fail closed", () => {
    expect(migration).toContain("when v_action = 'delete' then 'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("'PUBLICATION_LIFECYCLE_EXISTS'");
    expect(migration).toContain("'PUBLICATION_CONFIGURATION_EXISTS'");
    expect(migration).toContain("or coalesce((v_dependencies ->> 'total')::bigint, 0) > 0");
    expect(client).toContain("reauthenticateShowLifecycleR3");
  });

  it("uses the shared V3 idempotency/receipt ledger and preserves replay after the row version advances", () => {
    const claimIndex = migration.indexOf("private.studio2_claim_operation(");
    const loadIndex = migration.indexOf("select show_row.*", claimIndex);
    expect(claimIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(claimIndex);
    expect(migration).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
    expect(migration).toContain("return coalesce(v_claim -> 'result', '{}'::jsonb)");
    expect(client).toContain("studio2_reconcile_operation");
  });

  it("binds create, identity update, Show Mode update and delete to one server authority", () => {
    expect(migration).toContain("'show.create'");
    expect(migration).toContain("'show.update'");
    expect(migration).toContain("'show.mode.update'");
    expect(migration).toContain("'show.delete'");
    expect(migration).toContain("public.studio2_apply_show_lifecycle_change");
    expect(client).toContain("studio2_apply_show_lifecycle_change");
    expect(client).toContain("preflightShowLifecycle");
    expect(client).toContain("updateShowMode");
    expect(client).toContain("deleteShow");
  });

  it("emits a canonical completed-fact event from the successful operation receipt", () => {
    expect(migration).toContain("create trigger v3_emit_show_lifecycle_operation_event");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'deleted', v_action = 'delete'");
  });

  it("keeps the new privileged RPC surface narrow", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_show_lifecycle_preflight(uuid, uuid, text)",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_show_lifecycle_preflight(uuid, uuid, text)\n  to authenticated, service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_apply_show_lifecycle_change(\n  uuid, text, jsonb, uuid, text, uuid, bigint, text\n) from public, anon",
    );
  });
});
