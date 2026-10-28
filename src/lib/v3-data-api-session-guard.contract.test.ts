import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(
  "supabase/migrations/20261027174508_v3_data_api_active_session_guard.sql",
  "utf8",
);
const sessions = readFileSync(
  "supabase/migrations/20261016163000_v3_account_session_management.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-account-session-management-rehearsal.sh",
  "utf8",
);
describe("canonical Data API session revocation boundary", () => {
  it("validates read-only requests while retaining row-lock admission for writable requests", () => {
    const admission = readFileSync("supabase/migrations/20261028045945_v3_readonly_session_admission.sql", "utf8");
    expect(admission).toContain("language plpgsql\nvolatile");
    const branches = admission.split("if current_setting('transaction_read_only')::boolean then")[1].split("end if;")[0];
    const [readonly, writable] = branches.split("  else\n");
    for (const branch of [readonly, writable]) {
      expect(branch).toContain("session_row.id = v_claimed_session");
      expect(branch).toContain("session_row.user_id = v_actor");
      expect(branch).toContain("session_row.not_after > now()");
    }
    expect(readonly).not.toContain("for key share");
    expect(writable).toContain("for key share");
    expect(admission).toContain("message = 'SESSION_REVOKED'");
  });
  it("extends the existing hook before normal-mode and read-only early returns", () => {
    expect(migration).toContain(
      "pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)",
    );
    const patch = migration.slice(
      migration.indexOf("$guard$begin"),
      migration.indexOf("select state.mode$guard$"),
    );
    expect(patch).toContain("auth.jwt() ->> 'role', '') = 'authenticated'");
    expect(patch).toContain("perform private.v3_require_active_auth_session()");
    expect(migration).toContain("Canonical Data API pre-request hook is not configured");
    expect(migration).not.toContain("alter role authenticator");
  });
  it("uses canonical session ownership and expiration rather than an async revocation projection", () => {
    const guard = sessions.slice(
      sessions.indexOf("create or replace function private.v3_require_active_auth_session()"),
      sessions.indexOf("revoke all on function private.v3_require_active_auth_session()"),
    );
    for (const invariant of [
      "auth.jwt() ->> 'session_id'",
      "from auth.sessions",
      "session_row.user_id = v_actor",
      "session_row.not_after > now()",
      "SESSION_REVOKED",
    ])
      expect(guard).toContain(invariant);
    expect(guard).not.toContain("outbox");
  });
  it("requires real-Auth HTTP proof for revoked and signed-out tokens on ordinary reads", () => {
    for (const scenario of [
      "active session ordinary Data API read",
      "revoked token ordinary Data API read",
      "surviving session ordinary Data API read",
      "anonymous public read remains available",
      "signed-out token ordinary Data API read",
    ])
      expect(rehearsal).toContain(scenario);
    expect(rehearsal).toContain('[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]]');
  });
});

it("preserves narrow security recovery transport without allowing unrelated writes", () => {
  const recovery = readFileSync(
    "supabase/migrations/20261027175413_v3_session_recovery_data_api_modes.sql",
    "utf8",
  );
  expect(recovery).toContain("v3_register_migration_contract(");
  expect(recovery).toContain("v3_revoke_session");
  expect(recovery).toContain("private.v3_require_active_auth_session()");
  expect(recovery).not.toContain("return;");
  expect(rehearsal).toContain("array['read_only', 'maintenance']");
  expect(rehearsal).toContain("Unrelated volatile mutation bypassed the protected mode");
  expect(rehearsal).toContain("rollback;");
});
