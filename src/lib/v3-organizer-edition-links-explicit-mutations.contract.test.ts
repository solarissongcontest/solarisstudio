import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/confirmations/admin/editions.tsx", "utf8");
const client = readFileSync("src/integrations/confirmations/edition-bindings.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261026210500_v3_confirmation_edition_binding_operations.sql",
  "utf8",
);
const r3Migration = readFileSync(
  "supabase/migrations/20261026210600_v3_confirmation_edition_binding_r3_fresh_auth.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-confirmation-edition-binding-rehearsal.sh",
  "utf8",
);

function functionBody(source: string, name: string) {
  const marker = `create or replace function ${name}`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\nrevoke all on function", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("V3 Organizer Confirmation edition binding operations", () => {
  it("consumes the real S2 replay flag in both definitions before mutable checks", () => {
    const claim = readFileSync("supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql", "utf8");
    expect(claim).toContain("'replayed', true");
    for (const sql of [migration, r3Migration]) {
      const apply = functionBody(sql, "public.studio2_apply_confirmation_edition_binding_change");
      expect(apply).toContain("v_claim ->> 'replayed'");
      expect(apply).toContain("studio2_reconcile_operation((v_claim ->> 'operationId')::uuid)");
      expect(apply).not.toContain("v_claim ->> 'replay'");
      expect(apply.indexOf("if v_replay then")).toBeLessThan(apply.indexOf("v_preview :="));
      expect(apply.indexOf("if v_replay then")).toBeLessThan(apply.indexOf("v_before_version :="));
    }
    const repair = readFileSync("supabase/migrations/20261027054545_repair_confirmation_binding_replay_contract.sql", "utf8");
    expect(repair).toContain("pg_get_functiondef(");
    expect(repair).toContain("execute definition");
    expect(repair).not.toMatch(/(?:update|delete from) public\.(?:integration_links|studio2_operation_receipts)/i);
  });

  it("cuts the Organizer route over from browser-managed integration_links writes", () => {
    expect(route).toContain("loadConfirmationEditionBinding");
    expect(route).toContain("previewConfirmationEditionBindingChange");
    expect(route).toContain("applyConfirmationEditionBindingChange");
    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain("reconcileSystemOperation");
    expect(route).toContain("useAdminContext");
    expect(route).toContain("expectedVersion: current.preview.expectedVersion");
    expect(route).toContain('data-v3-confirmation-edition-binding="governed-versioned-operation"');

    expect(route).not.toContain('from("integration_links")');
    expect(route).not.toContain("saveConfirmationEdition");
    expect(route).not.toContain("setConfirmationEditionEditing");
    expect(route).not.toContain("Run legacy edition-link sync");
  });

  it("uses exact-edition projection, preview, apply and durable operation identities", () => {
    expect(client).toContain('"studio2_confirmation_edition_binding"');
    expect(client).toContain('"studio2_confirmation_edition_binding_preview"');
    expect(client).toContain('"studio2_apply_confirmation_edition_binding_change"');
    expect(client).toContain("p_expected_version: input.expectedVersion");
    expect(client).toContain("p_operation_id: input.operationId");
    expect(client).toContain("p_idempotency_key: input.idempotencyKey");
    expect(client).toContain("p_correlation_id: input.correlationId ?? input.operationId");
  });

  it("keeps integration_links canonical and refuses silent identity rebinding", () => {
    const apply = functionBody(r3Migration, "public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("from public.integration_links");
    expect(apply).toContain("insert into public.integration_links");
    expect(apply).toContain("update public.integration_links");
    expect(apply).toContain("delete from public.integration_links");
    expect(apply).toContain("Solaris edition is already bound to another Confirmation identity");
    expect(apply).toContain("Confirmation identity is already bound to another Solaris edition");
    expect(apply).not.toContain("order by edition_number desc");
    expect(apply).not.toContain("limit 1");
  });

  it("resolves idempotent replay before fresh-auth and mutable current-state validation", () => {
    const apply = functionBody(r3Migration, "public.studio2_apply_confirmation_edition_binding_change");
    const claim = apply.indexOf("private.studio2_claim_operation");
    const replay = apply.indexOf("if v_replay then");
    const freshAuth = apply.indexOf("private.studio2_require_fresh_auth(300)");
    const preview = apply.indexOf("v_preview := public.studio2_confirmation_edition_binding_preview");
    const versionCheck = apply.indexOf("v_before_version is distinct from p_expected_version");

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(freshAuth).toBeGreaterThan(replay);
    expect(preview).toBeGreaterThan(freshAuth);
    expect(versionCheck).toBeGreaterThan(preview);
    expect(apply).toContain("return public.studio2_reconcile_operation(p_operation_id)");
  });

  it("enforces the established R3 password + signed server freshness contract", () => {
    expect(client).toContain("reauthenticateConfirmationEditionR3");
    expect(client).toContain("confirmationsSupabase.auth.getUser()");
    expect(client).toContain("confirmationsSupabase.auth.signInWithPassword");
    expect(route).toContain('current.preview.riskClass === "R3"');
    expect(route).toContain("reauthenticateConfirmationEditionR3(reauthPassword)");
    expect(route).toContain('autoComplete="current-password"');
    expect(route).toContain("confirmDisabled={Boolean(pendingNeedsReauth && !reauthPassword)}");

    const apply = functionBody(r3Migration, "public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("if v_risk_class = 'R3' then");
    expect(apply).toContain("private.studio2_require_fresh_auth(300)");
    expect(apply).toContain("actor_session_id = v_auth_freshness ->> 'sessionId'");
    expect(apply).toContain("auth_freshness_evidence = v_auth_freshness");
  });

  it("enforces exact edition capability, lock and expected version", () => {
    const apply = functionBody(r3Migration, "public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("studio2_access_allowed('delegation.manage', p_edition_id, true)");
    expect(apply).toContain("pg_advisory_xact_lock");
    expect(apply).toContain("for update");
    expect(apply).toContain("v_before_version is distinct from p_expected_version");
    expect(apply).toContain("VERSION_CONFLICT");
    expect(apply).toContain("using errcode = 'PT409'");
    expect(apply).not.toContain("using errcode = '40001'");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("public.studio2_reconcile_operation");
  });

  it("persists a monotonic edition state revision across create/update/remove/editing", () => {
    const apply = functionBody(r3Migration, "public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("v_before_version := v_edition.data_revision");
    expect(apply).toContain("data_revision = edition.data_revision + 1");
    expect(apply).toContain("if v_kind in ('bind', 'remove') and v_changed then");
    expect(migration).not.toContain("confirmation_edition_binding_versions");
    expect(r3Migration).not.toContain("confirmation_edition_binding_versions");
  });

  it("emits completed facts into the existing Confirmation DomainEvent/outbox consumers", () => {
    const emit = functionBody(migration, "private.v3_emit_confirmation_edition_operation_event");
    expect(emit).toContain("private.v3_emit_domain_event");
    expect(emit).toContain("'confirmation.window_changed'");
    expect(emit).toContain("'confirmation_edition'");
    expect(emit).toContain("array['confirmation.tasks', 'confirmation.notifications']");
    expect(emit).toContain("if not v_changed then");
  });

  it("removes direct authenticated Confirmation binding DML without widening raw reads", () => {
    expect(migration).toContain('drop policy if exists "integration links organizer only"');
    expect(migration).toContain('create policy "integration links organizer read"');
    expect(migration).toContain('create policy "integration links organizer insert non-confirmations"');
    expect(migration).toContain('create policy "integration links organizer update non-confirmations"');
    expect(migration).toContain('create policy "integration links organizer delete non-confirmations"');
    expect(migration).toContain("using (public.studio2_access_allowed('edition.manage', edition_id, false));");
    expect(migration).toContain("service <> 'confirmations'");
    expect(migration).not.toContain("revoke insert, update, delete on public.integration_links from authenticated");
  });

  it("keeps the stateful rehearsal loopback-only and covers the requested hostile paths", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("wrong-edition organizer read");
    expect(rehearsal).toContain("delegation actor without delegation.manage");
    expect(rehearsal).toContain("direct Confirmation binding insert");
    expect(rehearsal).toContain("binding create replay");
    expect(rehearsal).toContain("IDEMPOTENCY_CONFLICT");
    expect(rehearsal).toContain("stale binding update");
    expect(rehearsal).toContain("stale expected version");
    expect(rehearsal).toContain("canonical binding readback");
    expect(rehearsal).toContain("operation receipt reconciliation");
    expect(rehearsal).toContain("binding remove");
    expect(rehearsal).toContain("ABA stale create");
    expect(rehearsal).toContain("conflicting binding apply");
    expect(rehearsal).toContain("DomainEvent and outbox evidence");
  });

  it("exposes typed failures instead of silently repairing conflicts", () => {
    expect(migration).toContain("AUTHORIZATION:");
    expect(migration).toContain("VALIDATION:");
    expect(migration).toContain("NOT_FOUND:");
    expect(migration).toContain("BINDING_CONFLICT:");
    expect(migration).toContain("BINDING_REQUIRED:");
    expect(migration).toContain("VERSION_CONFLICT:");
  });
});
