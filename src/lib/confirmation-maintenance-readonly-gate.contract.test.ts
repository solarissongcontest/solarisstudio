import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261017194000_confirmation_maintenance_readonly_gate.sql",
  "utf8",
);

const publicRuntime = readFileSync("src/lib/public.functions.ts", "utf8");

describe("Confirmation maintenance access in read-only platform mode", () => {
  it("allows only the exact emergency Confirmation RPC surface through the Data API gate", () => {
    expect(migration).toContain("if v_mode = 'read_only' then");

    for (const rpc of [
      "studio2_confirmation_round_change_preview",
      "public_resolve_edit_token",
      "studio2_apply_confirmation_round_change",
      "admin_update_confirmation_controls",
      "public_create_country_account_edit_token",
      "v3_submit_confirmation",
    ]) {
      expect(migration).toContain(`'${rpc}'`);
    }

    expect(migration).not.toContain("v_rpc_name like 'confirmation%");
    expect(migration).not.toContain("v_rpc_name like 'public_%confirmation%");
  });

  it("marks only approved read-only Confirmation mutations for the table write guard", () => {
    expect(migration).toContain(
      "set_config('studio2.confirmation_maintenance_write', 'on', true)",
    );
    expect(migration).toMatch(
      /if v_mode = 'read_only'\s+and coalesce\(current_setting\('studio2\.confirmation_maintenance_write', true\), ''\) = 'on' then/,
    );
    expect(migration).not.toMatch(
      /v_mode in \('read_only', 'maintenance'\)[\s\S]{0,180}studio2\.confirmation_maintenance_write/,
    );
  });

  it("keeps full maintenance mode stricter than the read-only Confirmation exception", () => {
    expect(migration).toContain("if v_mode = 'maintenance' then");
    expect(migration).toContain(
      "Solaris is currently maintenance, so Confirmation writes are unavailable",
    );
    expect(migration).toContain("if v_mode in ('read_only', 'maintenance') then");
  });

  it("preserves the canonical V3 submit contract behind an edit-token-only read-only wrapper", () => {
    expect(migration).toContain(
      "alter function public.v3_submit_confirmation(jsonb, uuid, text, text)",
    );
    expect(migration).toContain("rename to v3_submit_confirmation_core");
    expect(migration).toContain(
      "revoke all on function public.v3_submit_confirmation_core(jsonb, uuid, text, text)",
    );
    expect(migration).toContain(
      "and nullif(btrim(coalesce(payload ->> 'edit_token_hash', '')), '') is null then",
    );
    expect(migration).toContain(
      "Read-only Confirmation writes require an existing-response edit token",
    );
    expect(migration).toContain("return public.v3_submit_confirmation_core(");

    // The shipped server adapter keeps the same canonical RPC name. The policy
    // boundary belongs in the database, so receipt/reconciliation behavior does
    // not fork for the maintenance window.
    expect(publicRuntime).toContain('"v3_submit_confirmation"');
    expect(publicRuntime).toContain('"v3_reconcile_confirmation"');
  });

  it("does not weaken the existing platform recovery exceptions", () => {
    for (const rpc of [
      "studio2_apply_platform_mode_change",
      "studio2_platform_exit_database_preflight",
      "studio2_record_platform_exit_preflight",
    ]) {
      expect(migration).toContain(`'${rpc}'`);
    }
    expect(migration).toContain("proc.provolatile in ('s', 'i')");
    expect(migration).toContain("normal writes are unavailable");
    expect(migration).toContain("using errcode = '25006'");
  });
});
