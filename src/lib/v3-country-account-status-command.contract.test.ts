import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261024190500_v3_country_account_status_command.sql",
);
const client = source("src/lib/v3-country-account-status.ts");
const domainRegistry = source("src/lib/solaris-v6-domain-registry.ts");
const countryAccountFoundation = source(
  "supabase/migrations/20260811183000_country_accounts_and_terra_solaris_profiles.sql",
);
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

  it("uses the canonical registered delegation command and event identities", () => {
    expect(domainRegistry).toContain(
      'commands: ["delegation.assign", "delegation.suspend", "delegation.restore"]',
    );
    expect(domainRegistry).toContain('events: ["delegation.changed"]');
    expect(migration).toContain("then 'delegation.suspend'");
    expect(migration).toContain("else 'delegation.restore'");
    expect(migration).toContain("'delegation.changed'");
    expect(client).toContain('"delegation.suspend"');
    expect(client).toContain('"delegation.restore"');
    expect(migration).not.toContain("delegation.account.suspend");
    expect(migration).not.toContain("delegation.account.restore");
    expect(client).not.toContain("delegation.account.suspend");
    expect(client).not.toContain("delegation.account.restore");
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

  it("claims exact operations before current capability and mutable account checks", () => {
    const rpc = block(
      "create or replace function public.studio2_set_country_account_status_v3(",
      "revoke all on function public.studio2_set_country_account_status_v3(",
    );
    const claim = rpc.indexOf("v_claim := private.studio2_claim_operation(");
    const replay = rpc.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false)");
    const authorization = rpc.indexOf("if not public.studio2_access_allowed('delegation.manage'");
    const accountLock = rpc.indexOf("from public.country_accounts account", authorization);

    expect(claim).toBeGreaterThan(-1);
    expect(replay).toBeGreaterThan(claim);
    expect(authorization).toBeGreaterThan(replay);
    expect(accountLock).toBeGreaterThan(authorization);
    expect(rpc).toContain("grant or the country account changed after the original response was lost");
    expect(rpc).toContain("the claim back in the same transaction");
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

  it("uses a durable per-country event-version ledger because account rows can be recreated", () => {
    expect(countryAccountFoundation).toContain(
      "user_id uuid primary key references auth.users(id) on delete cascade",
    );
    expect(countryAccountFoundation).toContain(
      "country_id uuid not null unique references public.countries(id) on delete cascade",
    );
    expect(migration).toContain("create table if not exists private.v3_delegation_event_versions (");
    expect(migration).toContain("country_id uuid primary key references public.countries(id) on delete restrict");
    expect(migration).toContain("version bigint not null default 0 check (version >= 0)");
    expect(migration).toContain("on conflict (country_id) do update");
    expect(migration).toContain(
      "set version = private.v3_delegation_event_versions.version + 1",
    );
    expect(migration).toContain("returning version into v_delegation_version");
    expect(migration).not.toContain("add column if not exists revision bigint");
    expect(migration).not.toContain("v3_bump_country_account_revision");
  });

  it("emits one privacy-bounded delegation.changed fact with the durable aggregate version", () => {
    const eventStart = migration.indexOf("perform private.v3_emit_domain_event(");
    const eventEnd = migration.indexOf("v_result := jsonb_build_object(", eventStart);
    const event = migration.slice(eventStart, eventEnd);

    expect(eventStart).toBeGreaterThan(-1);
    expect(event).toContain("'delegation.changed'");
    expect(event).toContain("'delegation'");
    expect(event).toContain("p_country_id::text");
    expect(event).toContain("v_delegation_version");
    expect(event).toContain("'previousVersion', v_delegation_version - 1");
    expect(event).toContain("'version', v_delegation_version");
    expect(event).toContain("array[]::text[]");
    expect(event).not.toContain("'userId'");
    expect(event).not.toContain("'reason'");
    expect(event).not.toContain("'suspendedBy'");
    expect(migration).toContain("delegation.attention remains a");
    expect(migration).toContain("separately declared S5 consequence until a real worker/reconciler exists");
  });

  it("records immutable before/after access evidence with operation and delegation version", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'country_accounts'");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("'previousStatus', v_before.status");
    expect(migration).toContain("'status', v_after.status");
    expect(migration).toContain("'delegationVersion', v_delegation_version - 1");
    expect(migration).toContain("'delegationVersion', v_delegation_version");
    expect(migration).toContain("'previousUpdatedAt', v_before.updated_at");
    expect(migration).toContain("'updatedAt', v_after.updated_at");
    expect(migration).toContain("'receiptId', v_operation_id");
    expect(client).toContain("previousDelegationVersion: number");
    expect(client).toContain("delegationVersion: number");
  });

  it("preserves authentication while making suspension authoritative for country-owned editing", () => {
    expect(migration).toContain(
      "'sessionEffect', 'authentication_preserved_country_editing_rechecked_server_side'",
    );
    expect(migration).toContain("country_accounts.status = active");
    expect(migration).not.toContain("auth.sessions");
    expect(migration).not.toContain("delete from auth.users");
  });

  it("closes service-role runtime execution on the actor-bound command", () => {
    expect(migration).toContain(
      ") from public, anon, service_role;\ngrant execute on function public.studio2_set_country_account_status_v3(",
    );
    expect(migration).toContain(") to authenticated;");
    expect(migration).not.toContain(") to authenticated, service_role;");
  });

  it("lets reviewed callers freeze one operation identity across unresolved retries", () => {
    expect(client).toContain("export type CountryAccountStatusOperationIdentity");
    expect(client).toContain("operationIdentity?: CountryAccountStatusOperationIdentity");
    expect(client).toContain("export function createCountryAccountStatusOperationIdentity()");
    expect(client).toContain("idempotencyKey: operationId");
    expect(client).toContain("correlationId: operationId");
    expect(client).toContain("const operationIdentity = resolveOperationIdentity(input.operationIdentity)");
    expect(client).toContain("operationId: operationIdentity.operationId");
    expect(client).toContain("idempotencyKey: operationIdentity.idempotencyKey");
    expect(client).toContain("correlationId: operationIdentity.correlationId");
    expect(client).toContain("must retain and resupply operationIdentity");
  });

  it("preserves authoritative failed receipts instead of collapsing them into ambiguous transport errors", () => {
    expect(client).toContain("function requireSucceededReceipt(");
    expect(client).toContain('if (receipt.status === "failed")');
    expect(client).toContain("receipt.error?.message");
    expect(client).toContain('code: receipt.error?.code ?? "UNKNOWN"');
    expect(client).toContain('code: receipt.error?.code ?? "TIMEOUT"');
    expect(client).toContain("A valid authoritative receipt wins over");
    expect(client).toContain("return requireSucceededReceipt(receipt, command.operationId)");
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
