import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20261027200500_v3_identity_edge_active_session_boundary.sql",
);
const countryAuth = read("supabase/functions/country-auth/index.ts");
const adminPassword = read("supabase/functions/admin-country-password/index.ts");
const mediaAuthority = read(
  "supabase/migrations/20261027182223_v3_media_finalization_authority.sql",
);

describe("V3 Edge active-session identity boundary", () => {
  it("exposes only a narrow authenticated wrapper around canonical auth.sessions authority", () => {
    expect(migration).toContain("create or replace function public.v3_assert_active_session()");
    expect(migration).toContain("perform private.v3_require_active_auth_session();");
    expect(migration).toContain("revoke all on function public.v3_assert_active_session()\n  from public, anon, service_role");
    expect(migration).toContain("grant execute on function public.v3_assert_active_session()\n  to authenticated");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("auth.refresh_tokens");
  });

  it("requires a live session before country-auth private reads or Auth Admin mutations", () => {
    const currentUserStart = countryAuth.indexOf("async function currentUser()");
    const signupStart = countryAuth.indexOf('if (action === "signup")');
    expect(currentUserStart).toBeGreaterThan(-1);
    expect(signupStart).toBeGreaterThan(currentUserStart);

    const currentUser = countryAuth.slice(currentUserStart, signupStart);
    const getUser = currentUser.indexOf("authenticated.auth.getUser(token)");
    const assertActive = currentUser.indexOf('"v3_assert_active_session"');
    expect(getUser).toBeGreaterThan(-1);
    expect(assertActive).toBeGreaterThan(getUser);
    expect(currentUser).toContain("global: { headers: { Authorization: authorization } }");
    expect(currentUser).toContain("if (activeError || active !== true) return null");

    for (const action of ["profile", "set-email", "set-password"]) {
      const actionStart = countryAuth.indexOf(`if (action === "${action}")`);
      expect(actionStart).toBeGreaterThan(-1);
      const nextAction = countryAuth.indexOf("\n  if (action ===", actionStart + 1);
      const block = countryAuth.slice(actionStart, nextAction === -1 ? undefined : nextAction);
      expect(block).toContain("await currentUser()");
    }
  });

  it("requires a live organizer session before service-role password authority", () => {
    const getUser = adminPassword.indexOf("publicAuth.auth.getUser(token)");
    const assertActive = adminPassword.indexOf('"v3_assert_active_session"');
    const roleRead = adminPassword.indexOf('.from("studio2_role_assignments")');
    const authMutation = adminPassword.indexOf("service.auth.admin.updateUserById");

    expect(adminPassword).toContain("global: { headers: { Authorization: authorization } }");
    expect(getUser).toBeGreaterThan(-1);
    expect(assertActive).toBeGreaterThan(getUser);
    expect(roleRead).toBeGreaterThan(assertActive);
    expect(authMutation).toBeGreaterThan(roleRead);
    expect(adminPassword).toContain("if (activeSessionError || activeSession !== true)");
  });

  it("keeps actor-bound media terminal authority tied to the same canonical session state", () => {
    expect(mediaAuthority).toContain("if v_row.actor_id is not null and not exists (");
    expect(mediaAuthority).toContain(
      "select 1 from auth.sessions where id=p_actor_session_id and user_id=v_row.actor_id",
    );
    expect(mediaAuthority).toContain("then raise exception 'SESSION_REVOKED'");
  });
});
