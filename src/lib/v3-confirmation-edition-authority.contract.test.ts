import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261020090000_v3_confirmation_edition_authority.sql",
  "utf8",
);
const client = readFileSync("src/lib/v3-confirmation-edition-authority.ts", "utf8");
const route = readFileSync("src/routes/confirmations/admin/editions.tsx", "utf8");

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate or replace function ", start + marker.length);
  return migration.slice(start, next >= 0 ? next : migration.length);
}

describe("V3 Confirmation edition authority", () => {
  it("registers an additive S13 migration contract", () => {
    expect(migration).toContain("'v3.confirmation.edition-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,\n  null,");
  });

  it("exposes one exact-edition projection with no newest/active fallback", () => {
    const snapshot = functionBody("public.studio2_confirmation_edition_snapshot");
    expect(snapshot).toContain("p_edition_id uuid");
    expect(snapshot).toContain("Exact Organizer edition id is required");
    expect(snapshot).toContain("studio2_access_allowed('confirmation.manage', p_edition_id, false)");
    expect(snapshot).toContain("where edition.id = p_edition_id");
    expect(snapshot).toContain("'bindingState'");
    expect(snapshot).toContain("'roundCount'");
    expect(snapshot).toContain("'responseCount'");
    expect(snapshot).toContain("'stateVersion'");
    expect(snapshot).not.toContain("order by edition_number");
    expect(snapshot).not.toContain("status = 'active'");
  });

  it("blocks direct authenticated writes to edition binding and editing authority", () => {
    expect(migration).toContain("studio2_guard_confirmation_edition_link_write");
    expect(migration).toContain("Confirmation edition bindings must use the governed V3 command");
    expect(migration).toContain("studio2_guard_confirmation_edition_editing_write");
    expect(migration).toContain("Confirmation edition editing must use the governed V3 command");
    expect(migration).toContain("studio2.confirmation_edition_authority_write");
  });

  it("uses S2 semantic idempotency, exact CAS and actor reconciliation for binding repair", () => {
    const apply = functionBody("public.studio2_apply_confirmation_edition_link_reconciliation");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'confirmation.edition_link.reconcile'");
    expect(apply).toContain("'expectedVersion', p_expected_version");
    expect(apply).toContain("for update");
    expect(apply).toContain("using errcode = 'PT409'");
    expect(apply).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(apply).toContain("private.studio2_complete_operation");
  });

  it("preserves an existing legacy remote identity instead of rebinding history", () => {
    const apply = functionBody("public.studio2_apply_confirmation_edition_link_reconciliation");
    const staleUpdate = apply.slice(apply.indexOf("elsif v_link.edition_id"), apply.indexOf("select coalesce(version.version"));
    expect(staleUpdate).toContain("set edition_id = p_edition_id");
    expect(staleUpdate).toContain("sync_status = 'linked'");
    expect(staleUpdate).not.toContain("remote_id =");
    expect(apply).toContain("Confirmation remote identity is already bound to another Solaris edition");
  });

  it("binds editing changes to edition, remote identity, state version and R3 fresh auth", () => {
    const preview = functionBody("public.studio2_confirmation_edition_editing_preview");
    const apply = functionBody("public.studio2_apply_confirmation_edition_editing");

    expect(preview).toContain("'expectedRemoteId'");
    expect(preview).toContain("'requiresFreshAuth', v_risk = 'R3'");
    expect(apply).toContain("p_expected_remote_id text");
    expect(apply).toContain("v_link.remote_id is distinct from p_expected_remote_id");
    expect(apply).toContain("v_version is distinct from p_expected_version");
    expect(apply).toContain("private.studio2_require_fresh_auth(300)");
    expect(apply).toContain("'confirmation.edition.editing.set'");
  });

  it("emits canonical Confirmation consequences after authoritative editing changes", () => {
    const apply = functionBody("public.studio2_apply_confirmation_edition_editing");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("'confirmation.window_changed'");
    expect(apply).toContain("'confirmation_edition'");
    expect(apply).toContain("array['confirmation.tasks', 'confirmation.notifications']::text[]");
    expect(apply).toContain("insert into public.admin_audit_log");
  });

  it("reconciles uncertain browser outcomes instead of blindly retrying a mutation", () => {
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain("A response may be lost after the database committed");
    expect(client).toContain("never blindly retry the");
    expect(client).toContain("confirmation-edition-link:");
    expect(client).toContain("confirmation-edition-editing");
  });

  it("cuts the Organizer surface off from browser-owned integration authority", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("loadConfirmationEditionAuthority(editionId)");
    expect(route).toContain("previewConfirmationEditionLinkRepair(editionId)");
    expect(route).toContain("applyConfirmationEditionLinkRepair(pendingLink)");
    expect(route).toContain("previewConfirmationEditionEditing(editionId, targetEnabled)");
    expect(route).toContain("applyConfirmationEditionEditing(pendingEditing)");

    expect(route).not.toContain("saveConfirmationEdition");
    expect(route).not.toContain("setConfirmationEditionEditing");
    expect(route).not.toContain("solarisSupabase");
    expect(route).not.toContain('.from("integration_links")');
    expect(route).not.toContain("canonicalEditions.map");
  });

  it("keeps the UI fail-closed when exact Organizer context is absent", () => {
    expect(route).toContain("if (!editionId)");
    expect(route).toContain("Select an Organizer edition");
    expect(route).toContain("no active/newest-edition fallback");
  });
});
