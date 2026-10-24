import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261024190500_v3_country_account_status_command.sql",
);
const client = source("src/lib/v3-country-account-status.ts");
const legacy = source(
  "supabase/migrations/20260916033414_permission_engine_v2_country_admin_rpc_cutover.sql",
);

function block(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 country-account suspension/restoration command", () => {
  it("is an additive S13 forward-fix migration with a semantic key", () => {
    expect(migration).toContain("'v3.s7.country-account-status-command'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261019211500_v3_country_account_status_command'");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("binds server authorization, exact account identity and reviewed CAS", () => {
    const rpc = block(
      "create or replace function public.studio2_set_country_account_status_v3(",
      "revoke all on function public.studio2_set_country_account_status_v3(",
    );

    expect(rpc).toContain("v_actor uuid := auth.uid()");
    expect(rpc).toContain("studio2_access_allowed('delegation.manage', null, true)");
    expect(rpc).not.toContain("p_actor_id");
    expect(rpc).toContain("account.user_id = p_user_id");
    expect(rpc).toContain("account.country_id = p_country_id");
    expect(rpc).toContain("for update");
    expect(rpc).toContain("v_before.updated_at is distinct from p_expected_updated_at");
    expect(rpc).toContain("message = 'VERSION_CONFLICT'");
    expect(rpc).toContain("account.updated_at = p_expected_updated_at");
  });

  it("uses semantic idempotency before mutable-state validation and reconciles replay", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(migration).toContain("'expectedUpdatedAt', p_expected_updated_at");
    expect(migration).toContain("'targetStatus', v_status");
    expect(migration).toContain("'reason', v_reason");
    expect(migration).toContain("if coalesce((v_claim ->> 'replayed')::boolean, false)");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("records immutable before/after access evidence with operation identity", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'country_accounts'");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("'previousStatus', v_before.status");
    expect(migration).toContain("'status', v_after.status");
    expect(migration).toContain("'previousUpdatedAt', v_before.updated_at");
    expect(migration).toContain("'updatedAt', v_after.updated_at");
    expect(migration).toContain("'receiptId', v_operation_id");
  });

  it("preserves authentication while making suspension authoritative for country-owned editing", () => {
    expect(migration).toContain(
      "'sessionEffect', 'authentication_preserved_country_editing_rechecked_server_side'",
    );
    expect(migration).toContain("country_accounts.status = active");
    expect(migration).not.toContain("auth.sessions");
    expect(migration).not.toContain("delete from auth.users");
  });

  it("provides a non-retrying client with one bounded lost-response reconciliation", () => {
    expect(client).toContain("createOrganisationCommand");
    expect(client).toContain('riskClass: "R2"');
    expect(client).toContain('supabase.rpc("studio2_set_country_account_status_v3"');
    expect(client).toContain("p_expected_updated_at: input.currentUpdatedAt");
    expect(client).toContain("p_operation_id: command.operationId");
    expect(client).toContain("p_idempotency_key: command.idempotencyKey");
    expect(client).toContain('supabase.rpc("studio2_reconcile_operation"');
    expect(client).not.toContain("studio2_set_country_account_status_v3\", {\n      ...");
  });

  it("keeps the legacy status RPC only as a staged consumer-cutover bridge", () => {
    expect(legacy).toContain("function public.admin_set_country_account_status(");
    expect(migration).not.toContain("drop function public.admin_set_country_account_status");
    expect(migration).not.toContain("revoke all on function public.admin_set_country_account_status");
  });
});
