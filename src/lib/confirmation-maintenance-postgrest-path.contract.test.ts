import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261017201000_confirmation_maintenance_postgrest_path_and_reads.sql",
  "utf8",
);

const priorGate = readFileSync(
  "supabase/migrations/20261017194000_confirmation_maintenance_readonly_gate.sql",
  "utf8",
);

describe("Confirmation maintenance production PostgREST compatibility", () => {
  it("matches the real /rest/v1/rpc/<function> request path without broadening the RPC allowlist", () => {
    // These snippets are replacement values inside a PL/pgSQL string literal,
    // so embedded SQL quotes are doubled in the migration source. Assert the
    // exact encoded rewrite rather than a runtime function body that does not
    // exist literally in this file.
    expect(migration).toContain(
      "'if position(''/rpc/'' in v_path) > 0 then'",
    );
    expect(migration).toContain(
      "'v_rpc_name := split_part(split_part(v_path, ''/rpc/'', 2), ''?'', 1);'",
    );
    expect(migration).not.toContain("v_rpc_name like 'confirmation%");
    expect(migration).not.toContain("v_rpc_name like 'public_%confirmation%");

    for (const rpc of [
      "studio2_confirmation_round_change_preview",
      "public_resolve_edit_token",
      "studio2_apply_confirmation_round_change",
      "admin_update_confirmation_controls",
      "public_create_country_account_edit_token",
      "v3_submit_confirmation",
    ]) {
      expect(priorGate).toContain(`'${rpc}'`);
    }
  });

  it("cuts missed Organizer Confirmation reads off delegation.manage", () => {
    expect(migration).toContain("admin_confirmation_next_in_line(uuid)");
    expect(migration).toContain(
      "private.solaris_confirmation_admin_read_allowed(_edition_id, _edition_id is null)",
    );
    expect(migration).toContain("private.solaris_confirmation_calendar_read_allowed");
    expect(migration).toContain("private.solaris_confirmation_response_read_allowed(_submission_id)");
    expect(migration).toContain("Missing Solaris capability: confirmation.read");
  });

  it("keeps technical and recovery material behind confirmation.manage", () => {
    expect(migration).toContain("private.solaris_confirmation_response_manage_allowed");
    expect(migration).toContain("studio2_access_allowed('confirmation.manage', submission.edition_id, false)");
    // Recovery authority is also injected via dynamic SQL, so the capability
    // quotes are doubled in the migration source. Keep this assertion exact so
    // changing it to confirmation.read cannot slip through the contract test.
    expect(migration).toContain(
      "'public.studio2_access_allowed(''confirmation.manage'', null, true)'",
    );
    expect(migration).not.toContain(
      "'public.studio2_access_allowed(''confirmation.read'', null, true)'",
    );
    expect(migration).toContain("Missing Solaris capability: confirmation.manage");
  });

  it("marks genuinely read-only version RPCs stable so read_only mode can serve them", () => {
    expect(migration).toContain("alter function public.admin_confirmation_version_summary() stable");
    expect(migration).toContain("alter function public.admin_confirmation_versions(uuid) stable");
  });
});
