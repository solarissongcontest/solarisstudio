import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 permission R3 contract", () => {
  const migration = source(
    "supabase/migrations/20261003005000_organisation_os_v5_permission_r3.sql",
  );
  const service = source("src/lib/permission-engine-admin.ts");
  const route = source("src/routes/_authenticated/admin/access-permissions.tsx");

  it("versions every effective role and direct-grant mutation", () => {
    expect(migration).toContain("public.studio2_access_state_versions");
    expect(migration).toContain("studio2_role_assignments_access_version");
    expect(migration).toContain("studio2_capability_grants_access_version");
    expect(migration).toContain(
      "set version = public.studio2_access_state_versions.version + 1",
    );
    expect(migration).toContain("old.expires_at is distinct from new.expires_at");
  });

  it("requires an R3 preview before the governed command", () => {
    expect(migration).toContain("public.studio2_permission_change_preview");
    expect(migration).toContain("'riskClass', 'R3'");
    expect(migration).toContain("'expectedVersion', v_expected_version");
    expect(migration).toContain("'affectedCapabilities', v_affected");
    expect(migration).toContain("'globalScope'");
    expect(migration).toContain("'selfChange'");
    expect(service).toContain('rpc("studio2_permission_change_preview"');
    expect(route).toContain("previewPermissionChange(command)");
    expect(route).toContain("<PermissionImpactPreview pending={pendingChange} />");
    expect(route).toContain("Type ${pendingChange.preview.targetDisplayName} to confirm this R3 access change");
  });

  it("binds apply to operation identity, expected version and canonical receipt", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'permissions.access.change'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain(
      "Access changed since this impact preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(service).toContain("p_operation_id: input.operationId");
    expect(service).toContain("p_idempotency_key: input.idempotencyKey");
    expect(service).toContain("p_expected_version: input.expectedVersion");
  });

  it("writes before/after access snapshots into the Organizer audit trail", () => {
    expect(migration).toContain("private.studio2_access_state_snapshot");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'permissions_access_change'");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("'riskClass', 'R3'");
  });

  it("removes the legacy authenticated permission-mutation bypass", () => {
    expect(migration).toContain(
      "revoke execute on function public.studio2_grant_capability(",
    );
    expect(migration).toContain(
      "revoke execute on function public.studio2_revoke_capability(",
    );
    expect(migration).toContain(
      "revoke execute on function public.studio2_assign_access_role(",
    );
    expect(migration).toContain(
      "revoke execute on function public.studio2_revoke_access_role(",
    );
    expect(migration).toContain("from authenticated;");
    expect(migration).toContain("to service_role;");
  });

  it("uses one preview identity for retries rather than generating IDs during apply", () => {
    expect(route).toContain("operationId: crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: crypto.randomUUID()");
    expect(route).toContain("operationId: pending.operationId");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
  });
});
