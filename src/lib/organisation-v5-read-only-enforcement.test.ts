import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 Read-only and Maintenance enforcement", () => {
  const enforcement = source(
    "supabase/migrations/20261003210000_organisation_os_v5_read_only_enforcement.sql",
  );
  const platform = source(
    "supabase/migrations/20261003174000_organisation_os_v5_platform_operational_modes.sql",
  );

  it("registers a private PostgREST pre-request gate", () => {
    expect(enforcement).toContain("private.studio2_data_api_operational_gate");
    expect(enforcement).toContain(
      "alter role authenticator\n  set pgrst.db_pre_request = 'private.studio2_data_api_operational_gate'",
    );
    expect(enforcement).toContain("current_setting('request.method', true)");
    expect(enforcement).toContain("current_setting('request.path', true)");
    expect(enforcement).toContain("notify pgrst, 'reload config'");
  });

  it("keeps reads available while volatile legacy mutation RPCs fail closed", () => {
    expect(enforcement).toContain("v_method in ('GET', 'HEAD', 'OPTIONS')");
    expect(enforcement).toContain("proc.provolatile in ('s', 'i')");
    expect(enforcement).toContain(
      "'studio2_apply_platform_mode_change'",
    );
    expect(enforcement).toContain(
      "'studio2_platform_exit_database_preflight'",
    );
    expect(enforcement).toContain(
      "'studio2_record_platform_exit_preflight'",
    );
    expect(enforcement).toContain(
      "normal writes are unavailable",
    );
    expect(enforcement).toContain("using errcode = '25006'");
  });

  it("guards every directly client-writable public table from real grants", () => {
    expect(enforcement).toContain("information_schema.table_privileges");
    expect(enforcement).toContain("grant_row.grantee in ('anon', 'authenticated')");
    expect(enforcement).toContain(
      "grant_row.privilege_type in ('INSERT', 'UPDATE', 'DELETE')",
    );
    expect(enforcement).toContain("studio2_platform_direct_write_guard");
    expect(enforcement).toContain("private.studio2_guard_direct_client_write()");
  });

  it("does not let SECURITY DEFINER identity accidentally bypass the write guard", () => {
    expect(enforcement).toContain(
      "if session_user in ('postgres', 'supabase_admin') then",
    );
    expect(enforcement).not.toContain(
      "if current_user in ('postgres', 'supabase_admin') then",
    );
  });

  it("invalidates Storage writes and pre-issued upload tokens in restricted modes", () => {
    expect(enforcement).toContain(
      "private.studio2_platform_mutation_allowed('storage.upload')",
    );
    expect(enforcement).toContain(
      "private.studio2_platform_mutation_allowed('storage.delete')",
    );
    expect(enforcement).toContain(
      "private.studio2_country_media_upload_token_valid",
    );
    expect(enforcement).toContain("public.integrity_can_upload_evidence");
    expect(enforcement).toContain('"organizers upload edition artwork"');
    expect(enforcement).toContain('"country fonts authenticated upload"');
    expect(enforcement).toContain('"Public beta testers can upload screenshots"');
    expect(enforcement).toContain(
      "grant execute on function private.studio2_platform_mutation_allowed(text)",
    );
  });

  it("marks only the protected platform recovery transaction as a direct-write bypass", () => {
    expect(platform).toContain(
      "set_config('studio2.platform_recovery_write', 'on', true)",
    );
    expect(enforcement).toContain(
      "current_setting('studio2.platform_recovery_write', true)",
    );
  });
});
