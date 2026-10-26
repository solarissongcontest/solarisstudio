import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/confirmations/admin/editions.tsx", "utf8");
const client = readFileSync("src/integrations/confirmations/edition-bindings.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261026210500_v3_confirmation_edition_binding_operations.sql",
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\nrevoke all on function", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("V3 Organizer Confirmation edition binding operations", () => {
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
    const apply = functionBody("public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("from public.integration_links");
    expect(apply).toContain("insert into public.integration_links");
    expect(apply).toContain("update public.integration_links");
    expect(apply).toContain("delete from public.integration_links");
    expect(apply).toContain("Solaris edition is already bound to another Confirmation identity");
    expect(apply).toContain("Confirmation identity is already bound to another Solaris edition");
    expect(apply).not.toContain("order by edition_number desc");
    expect(apply).not.toContain("limit 1");
  });

  it("enforces exact edition capability, lock, expected version and idempotency", () => {
    const apply = functionBody("public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("studio2_access_allowed('delegation.manage', p_edition_id, true)");
    expect(apply).toContain("private.studio2_claim_operation");
    expect(apply).toContain("pg_advisory_xact_lock");
    expect(apply).toContain("for update");
    expect(apply).toContain("v_before_version is distinct from p_expected_version");
    expect(apply).toContain("VERSION_CONFLICT");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("public.studio2_reconcile_operation");
    expect(apply.indexOf("private.studio2_claim_operation")).toBeLessThan(
      apply.indexOf("v_before_version is distinct from p_expected_version"),
    );
  });

  it("persists a monotonic edition state revision across create/update/remove/editing", () => {
    const apply = functionBody("public.studio2_apply_confirmation_edition_binding_change");
    expect(apply).toContain("v_before_version := v_edition.data_revision");
    expect(apply).toContain("data_revision = edition.data_revision + 1");
    expect(apply).toContain("if v_kind in ('bind', 'remove') and v_changed then");
    expect(migration).not.toContain("confirmation_edition_binding_versions");
  });

  it("emits completed facts into the existing Confirmation DomainEvent/outbox consumers", () => {
    const emit = functionBody("private.v3_emit_confirmation_edition_operation_event");
    expect(emit).toContain("private.v3_emit_domain_event");
    expect(emit).toContain("'confirmation.window_changed'");
    expect(emit).toContain("'confirmation_edition'");
    expect(emit).toContain("array['confirmation.tasks', 'confirmation.notifications']");
    expect(emit).toContain("if not v_changed then");
  });

  it("removes direct authenticated Confirmation binding DML without breaking other integration services", () => {
    expect(migration).toContain('drop policy if exists "integration links organizer only"');
    expect(migration).toContain('create policy "integration links organizer read"');
    expect(migration).toContain('create policy "integration links organizer insert non-confirmations"');
    expect(migration).toContain('create policy "integration links organizer update non-confirmations"');
    expect(migration).toContain('create policy "integration links organizer delete non-confirmations"');
    expect(migration).toContain("service <> 'confirmations'");
    expect(migration).not.toContain("revoke insert, update, delete on public.integration_links from authenticated");
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
