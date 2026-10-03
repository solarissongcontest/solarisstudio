// Validation run 2: exact R3 permission code plus a no-op test marker.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 governed permission commands", () => {
  const migration = source(
    "supabase/migrations/20261003004500_organisation_os_v5_permission_commands.sql",
  );
  const client = source("src/lib/permission-engine-admin.ts");
  const route = source("src/routes/_authenticated/admin/access-permissions.tsx");

  it("uses an authoritative per-user access revision for stale-preview rejection", () => {
    expect(migration).toContain("studio2_permission_state_versions");
    expect(migration).toContain("private.studio2_lock_permission_version");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_current_version <> p_expected_version");
    expect(migration).toContain(
      "Access changed since this impact preview was loaded. Reload the preview before applying the change.",
    );
  });

  it("invalidates previews when the underlying assignment or grant tables change", () => {
    expect(migration).toContain("studio2_role_assignment_version_bump");
    expect(migration).toContain("studio2_capability_grant_version_bump");
    expect(migration).toContain("private.studio2_permission_state_version_trigger");
    expect(migration).toContain(
      "if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then",
    );
  });

  it("previews every permission mutation as an R3 impact before execution", () => {
    expect(migration).toContain("public.studio2_permission_change_preview");
    expect(migration).toContain("'riskClass', 'R3'");
    expect(migration).toContain("'expectedVersion', v_version");
    expect(migration).toContain("'affectedCapabilities'");
    expect(migration).toContain("'grantsPermissionAdministration'");
    expect(migration).toContain("'globalScope'");
    expect(migration).toContain("'selfChange'");
    expect(client).toContain('rpc("studio2_permission_change_preview"');
    expect(route).toContain("PermissionImpactPreview");
    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain('command: "permissions.access_change"');
    expect(route).toContain('riskClass: "R3"');
    expect(route).toContain("Risk R3");
    expect(route).toContain("confirmationText={pendingChange?.preview.targetDisplayName}");
  });

  it("executes through the common operation receipt contract before checking mutable state", () => {
    const claimIndex = migration.indexOf("private.studio2_claim_operation(");
    const versionIndex = migration.indexOf(
      "v_current_version := private.studio2_lock_permission_version",
    );
    expect(claimIndex).toBeGreaterThan(-1);
    expect(versionIndex).toBeGreaterThan(claimIndex);
    expect(migration).toContain("'permissions.access_change'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("return v_claim -> 'result'");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(client).toContain('rpc("studio2_apply_permission_change"');
    expect(client).toContain("p_operation_id");
    expect(client).toContain("p_idempotency_key");
    expect(client).toContain("p_expected_version");
  });

  it("makes browser permission writes use the R3 path instead of legacy direct RPCs", () => {
    for (const signature of [
      "public.studio2_grant_capability(uuid, text, uuid, timestamptz)",
      "public.studio2_revoke_capability(uuid, text, uuid)",
      "public.studio2_assign_access_role(uuid, text, uuid, timestamptz)",
      "public.studio2_revoke_access_role(uuid, text, uuid)",
    ]) {
      expect(migration).toContain(signature);
    }

    expect(migration).toContain(
      "raise exception 'Use the governed R3 permission change command'",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("audits a changed access mutation and returns a canonical versioned receipt", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'permission_' || p_change_kind");
    expect(migration).toContain("'previousVersion', v_current_version");
    expect(migration).toContain("'version', v_next_version");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(client).toContain('riskClass: "R3"');
    expect(client).toContain("previousVersion");
    expect(client).toContain("operationId");
  });
});
