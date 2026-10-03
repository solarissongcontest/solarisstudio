import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 high-risk operation contracts", () => {
  const permissionMigration = source(
    "supabase/migrations/20261003012000_organisation_os_v5_permission_operations.sql",
  );
  const r3FreshAuthMigration = source(
    "supabase/migrations/20261003143000_organisation_os_v5_r3_fresh_auth.sql",
  );
  const permissionClient = source("src/lib/permission-engine-admin.ts");
  const permissionRoute = source(
    "src/routes/_authenticated/admin/access-permissions.tsx",
  );
  const resultsMigration = source(
    "supabase/migrations/20260912154500_studio2_results_operations.sql",
  );
  const resultsClient = source("src/lib/studio2-results-operations.ts");

  it("makes every authenticated permission mutation an R3 previewed operation", () => {
    expect(permissionMigration).toContain("public.studio2_permission_change_preview");
    expect(permissionMigration).toContain("public.studio2_apply_permission_change");
    expect(permissionMigration).toContain("'R3'");
    expect(permissionMigration).toContain("private.studio2_claim_operation");
    expect(permissionMigration).toContain("p_operation_id");
    expect(permissionMigration).toContain("p_idempotency_key");
    expect(permissionMigration).toContain("p_expected_version");
    expect(permissionMigration).toContain(
      "Access changed since this preview was loaded. Refresh the impact preview before continuing.",
    );
    expect(permissionMigration).toContain("using errcode = '40001'");
  });

  it("versions permission subjects for UI, service-role and trigger-driven access changes", () => {
    expect(permissionMigration).toContain(
      "create table if not exists public.studio2_permission_subject_versions",
    );
    expect(permissionMigration).toContain(
      "private.studio2_touch_permission_subject_version",
    );
    expect(permissionMigration).toContain(
      "after insert or update or delete on public.studio2_role_assignments",
    );
    expect(permissionMigration).toContain(
      "after insert or update or delete on public.studio2_capability_grants",
    );
    expect(permissionMigration).toContain(
      "public.studio2_permission_subject_versions.version + 1",
    );
  });

  it("closes authenticated bypasses through the legacy grant and revoke RPCs", () => {
    for (const signature of [
      "studio2_grant_capability(uuid, text, uuid, timestamptz)",
      "studio2_revoke_capability(uuid, text, uuid)",
      "studio2_assign_access_role(uuid, text, uuid, timestamptz)",
      "studio2_revoke_access_role(uuid, text, uuid)",
    ]) {
      expect(permissionMigration).toContain(
        `revoke execute on function public.${signature}`,
      );
    }
    expect(permissionMigration).toContain("from authenticated");
  });

  it("binds the permissions UI to impact preview and a stable retry identity", () => {
    expect(permissionClient).toContain('rpc("studio2_permission_change_preview"');
    expect(permissionClient).toContain('rpc("studio2_apply_permission_change_r3"');
    expect(permissionClient).not.toContain('rpc("studio2_assign_access_role"');
    expect(permissionClient).not.toContain('rpc("studio2_revoke_access_role"');
    expect(permissionClient).not.toContain('rpc("studio2_grant_capability"');
    expect(permissionClient).not.toContain('rpc("studio2_revoke_capability"');

    expect(permissionRoute).toContain("AdminConfirmSheet");
    expect(permissionRoute).toContain("previewPermissionChange(command)");
    expect(permissionRoute).toContain("operationId: crypto.randomUUID()");
    expect(permissionRoute).toContain("idempotencyKey: crypto.randomUUID()");
    expect(permissionRoute).toContain(
      "expectedVersion: pending.preview.expectedVersion",
    );
    expect(permissionRoute).toContain("PermissionImpactPreview");
    expect(permissionRoute).toContain("Risk R3");
  });

  it("requires signed recent authentication evidence for new R3 permission mutations", () => {
    expect(r3FreshAuthMigration).toContain("private.studio2_auth_freshness_evidence");
    expect(r3FreshAuthMigration).toContain("private.studio2_require_fresh_auth");
    expect(r3FreshAuthMigration).toContain("coalesce(v_claims -> 'amr', '[]'::jsonb)");
    expect(r3FreshAuthMigration).toContain("not in ('token_refresh', 'anonymous')");
    expect(r3FreshAuthMigration).toContain("Fresh authentication required for this R3 operation");
    expect(r3FreshAuthMigration).toContain("studio2_apply_permission_change_r3");
    expect(r3FreshAuthMigration).toContain("auth_freshness_evidence");
    expect(r3FreshAuthMigration).toContain("actor_session_id");
    expect(r3FreshAuthMigration).toContain("v_existing.operation_id is not null");

    expect(permissionClient).toContain("reauthenticatePermissionR3");
    expect(permissionClient).toContain("supabase.auth.signInWithPassword");
    expect(permissionRoute).toContain("Fresh authentication required");
    expect(permissionRoute).toContain('type="password"');
    expect(permissionRoute).toContain('autoComplete="current-password"');
  });

  it("keeps Results on its existing equivalent concurrency and replay contract", () => {
    expect(resultsMigration).toContain("p_execution_id uuid");
    expect(resultsMigration).toContain("p_expected_version bigint");
    expect(resultsMigration).toContain(
      "p_expected_version <> v_ops.calculation_version",
    );
    expect(resultsMigration).toContain("execution_id uuid not null unique");
    expect(resultsMigration).toContain(
      "jsonb_build_object('idempotentReplay', true)",
    );
    expect(resultsClient).toContain("p_execution_id: input.executionId");
    expect(resultsClient).toContain("p_expected_version: input.expectedVersion");
  });
});
