import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 R3 permission safety", () => {
  const migration = source(
    "supabase/migrations/20261003005000_organisation_os_v5_permission_safety.sql",
  );
  const client = source("src/lib/permission-engine-admin.ts");
  const route = source("src/routes/_authenticated/admin/access-permissions.tsx");

  it("requires a server preview before applying an access mutation", () => {
    expect(migration).toContain(
      "create or replace function public.studio2_permission_change_preview",
    );
    expect(migration).toContain("'riskClass', 'R3'");
    expect(migration).toContain("'expectedVersion', v_version");
    expect(migration).toContain("'affectedCapabilities', to_jsonb(v_capabilities)");
    expect(migration).toContain("'globalScope', p_edition_id is null");
    expect(migration).toContain("'permissionAdministration'");
    expect(migration).toContain("'selfChange'");
  });

  it("applies permission mutations as idempotent R3 commands", () => {
    expect(migration).toContain(
      "create or replace function public.studio2_apply_permission_change",
    );
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'permissions.' || p_change_kind");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("'expiresAt', p_expires_at");
    expect(migration).toContain("'expectedVersion', p_expected_version");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("'operationId', v_operation_id");
  });

  it("rejects stale previews instead of silently overwriting newer access", () => {
    expect(migration).toContain("studio2_permission_subject_versions");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_previous_version <> p_expected_version");
    expect(migration).toContain(
      "Permission access changed after preview. Expected version %, current version %.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("increments access versions for every role or direct-grant mutation", () => {
    expect(migration).toContain("studio2_bump_permission_subject_version");
    expect(migration).toContain("studio2_role_assignment_version_bump");
    expect(migration).toContain("studio2_capability_grant_version_bump");
    expect(migration).toContain(
      "after insert or update or delete on public.studio2_role_assignments",
    );
    expect(migration).toContain(
      "after insert or update or delete on public.studio2_capability_grants",
    );
    expect(migration).toContain("version = subject_version.version + 1");
  });

  it("binds operation receipts to the same risk and command scope", () => {
    expect(migration).toContain("v_receipt.risk_class <> p_risk_class");
    expect(migration).toContain("v_receipt.scope is distinct from v_scope");
    expect(migration).toContain(
      "Operation identity is already bound to a different command scope",
    );
  });

  it("removes authenticated access to legacy direct permission mutations", () => {
    for (const signature of [
      "public.studio2_grant_capability(\n  uuid, text, uuid, timestamptz\n) from authenticated",
      "public.studio2_revoke_capability(\n  uuid, text, uuid\n) from authenticated",
      "public.studio2_assign_access_role(\n  uuid, text, uuid, timestamptz\n) from authenticated",
      "public.studio2_revoke_access_role(\n  uuid, text, uuid\n) from authenticated",
    ]) {
      expect(migration).toContain(signature);
    }
    expect(migration).toContain(
      "to service_role;\n\ngrant execute on function public.studio2_revoke_capability",
    );
  });

  it("keeps the Organizer UI on preview → typed confirmation → apply", () => {
    expect(client).toContain('rpc("studio2_permission_change_preview"');
    expect(client).toContain('rpc("studio2_apply_permission_change"');
    expect(client).toContain("p_expected_version: input.expectedVersion");
    expect(client).toContain("p_operation_id: input.operationId");
    expect(client).toContain("p_idempotency_key: input.idempotencyKey");

    expect(route).toContain("previewPermissionChange(command)");
    expect(route).toContain("<PermissionImpactPreview pending={pendingChange}");
    expect(route).toContain("Risk R3");
    expect(route).toContain("confirmationText={pendingChange?.preview.targetDisplayName}");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
  });

  it("writes before/after audit evidence for changed access", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'permission_r3_' || p_change_kind");
    expect(migration).toContain("'accessVersion', v_previous_version");
    expect(migration).toContain("'accessVersion', v_next_version");
    expect(migration).toContain("'affectedCapabilities', to_jsonb(v_capabilities)");
  });
});
