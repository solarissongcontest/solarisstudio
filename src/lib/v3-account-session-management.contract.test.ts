import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016163000_v3_account_session_management.sql",
);
const hardening = source(
  "supabase/migrations/20261016163100_v3_account_session_management_hardening.sql",
);

describe("System V3 P42 account session management", () => {
  it("derives opaque browser handles instead of exposing Auth session ids", () => {
    expect(migration).toContain("private.v3_session_handle");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'sha256'");
    expect(migration).toContain("'sessionHandle', private.v3_session_handle");
    expect(migration).not.toContain("'sessionId', session_row.id");
  });

  it("requires the signed current session to still exist in auth.sessions", () => {
    expect(migration).toContain("private.v3_require_active_auth_session");
    expect(migration).toContain("auth.jwt() ->> 'session_id'");
    expect(migration).toContain("from auth.sessions session_row");
    expect(migration).toContain("session_row.user_id = v_actor");
    expect(migration).toContain("message = 'SESSION_REVOKED'");
  });

  it("folds active-session checking into the canonical R3 fresh-auth boundary", () => {
    expect(migration).toContain("create or replace function private.studio2_require_fresh_auth");
    expect(migration).toContain("v_session_id := private.v3_require_active_auth_session()");
    expect(migration).toContain("private.studio2_auth_freshness_evidence(p_max_age_seconds)");
    expect(migration).toContain("not coalesce((v_evidence ->> 'fresh')::boolean, false)");
  });

  it("keeps the participant projection privacy-safe and deterministic", () => {
    const start = migration.indexOf("create or replace function public.v3_my_sessions()");
    const end = migration.indexOf("comment on function public.v3_my_sessions()", start);
    const projection = migration.slice(start, end);

    expect(projection).toContain("'current', session_row.id = v_current_session");
    expect(projection).toContain("date_trunc('minute'");
    expect(projection).toContain("private.v3_session_client_label(session_row.user_agent)");
    expect(projection).toContain("'aal', coalesce(session_row.aal::text, 'aal1')");
    expect(projection).toContain("order by");
    expect(projection).not.toContain("'ip'");
    expect(projection).not.toContain("'userAgent'");
    expect(projection).not.toContain("'refreshToken'");
    expect(projection).not.toContain("'accessToken'");
    expect(projection).not.toContain("'scopes'");
  });

  it("keeps direct Auth and revocation storage inaccessible to browser roles", () => {
    expect(migration).toContain("alter table public.studio2_account_session_revocations enable row level security");
    expect(migration).toContain("revoke all on table public.studio2_account_session_revocations");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("revoke all on function private.v3_require_active_auth_session()");
    expect(migration).toContain("revoke all on function private.v3_session_handle(uuid, uuid)");
  });

  it("revokes only a non-current session belonging to the authenticated actor", () => {
    expect(hardening).toContain("session_row.user_id = v_actor");
    expect(hardening).toContain("session_row.id <> v_current_session");
    expect(hardening).toContain("if v_handle = v_current_handle then");
    expect(hardening).toContain("Use the canonical current-session sign-out flow.");
    expect(hardening).toContain("delete from auth.sessions session_row");
  });

  it("requires fresh authentication for a consequential revocation", () => {
    expect(hardening).toContain("v_evidence := private.studio2_require_fresh_auth(300)");
    expect(hardening).toContain("'account.session.revoke'");
    expect(hardening).toContain("'R3'");
  });

  it("uses S2 semantic idempotency and a private tombstone for reconciliation", () => {
    expect(hardening).toContain("private.studio2_claim_operation(");
    expect(hardening).toContain("p_operation_id,");
    expect(hardening).toContain("jsonb_build_object('sessionHandle', v_handle)");
    expect(hardening).toContain("private.studio2_complete_operation");
    expect(hardening).toContain("alreadyRevoked");
    expect(migration).toContain("studio2_account_session_revocations");
  });

  it("does not allow session handles to probe another user's session", () => {
    expect(hardening).toContain("where session_row.user_id = v_actor");
    expect(hardening).toContain("where revocation.user_id = v_actor");
    expect(hardening).toContain("raise exception using errcode = 'P0002', message = 'UNKNOWN'");
  });

  it("allows security revocation during read-only and maintenance modes", () => {
    expect(migration).toContain("'account.session.revoke'");
    expect(migration).toContain("when 'read_only' then");
    expect(migration).toContain("when 'maintenance' then");
  });

  it("removes raw session id from the public R3 auth-status response", () => {
    expect(hardening).toContain("return v_evidence - 'sessionId'");
  });
});
