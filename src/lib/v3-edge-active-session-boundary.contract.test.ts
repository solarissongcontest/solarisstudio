import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20261027200500_v3_identity_edge_active_session_boundary.sql",
);
const countryAuth = read("supabase/functions/country-auth/index.ts");
const adminPassword = read("supabase/functions/admin-country-password/index.ts");
const mediaFinalizer = read("supabase/functions/solaris-upload-finalize/index.ts");
const organizerServer = read("src/integrations/supabase/organizer.server.ts");
const juryBoundary = read("src/integrations/jury-voting/jury-voting.functions.ts");
const mediaAuthority = read(
  "supabase/migrations/20261027182223_v3_media_finalization_authority.sql",
);

describe("V3 active-session identity boundary", () => {
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

  it("centralizes server identity proof and fences jury service-role reads at the request boundary", () => {
    const helperStart = organizerServer.indexOf(
      "export async function requireSolarisActiveUserForAccessTokenServer",
    );
    const organizerStart = organizerServer.indexOf(
      "export async function requireSolarisOrganizerServer",
    );
    expect(helperStart).toBeGreaterThan(-1);
    expect(organizerStart).toBeGreaterThan(helperStart);

    const helper = organizerServer.slice(helperStart, organizerStart);
    const getUser = helper.indexOf("client.auth.getUser(token)");
    const assertActive = helper.indexOf('"v3_assert_active_session"');
    expect(getUser).toBeGreaterThan(-1);
    expect(assertActive).toBeGreaterThan(getUser);
    expect(helper).toContain("if (activeError || active !== true)");

    const identityProof = juryBoundary.indexOf(
      "await requireSolarisActiveUserForAccessTokenServer(data.accessToken)",
    );
    const integrityImport = juryBoundary.indexOf(
      '"@/integrations/jury-voting/jury-integrity-v5.server"',
    );
    const integrityCall = juryBoundary.indexOf("runJuryIntegrityPreflightV5Server(data)");
    expect(identityProof).toBeGreaterThan(-1);
    expect(integrityImport).toBeGreaterThan(identityProof);
    expect(integrityCall).toBeGreaterThan(integrityImport);
  });

  it("proves actor liveness before the media finalizer reaches any service-role database or Storage authority", () => {
    const handlerStart = mediaFinalizer.indexOf("Deno.serve(async (request) =>");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = mediaFinalizer.slice(handlerStart);
    const identityProof = handler.indexOf("await callerIdentity(supabaseUrl, anonKey, authorization)");
    const revokedReject = handler.indexOf("if (caller.revoked)");
    const serviceClient = handler.indexOf("createClient(supabaseUrl, serviceRoleKey");
    const authorizationRead = handler.indexOf('.from("studio2_upload_authorizations")');
    const quarantineRead = handler.indexOf('.from("solaris-upload-quarantine")');
    const finalPublish = handler.indexOf(".upload(row.final_path, finalBlob");

    for (const offset of [
      identityProof,
      revokedReject,
      serviceClient,
      authorizationRead,
      quarantineRead,
      finalPublish,
    ]) {
      expect(offset).toBeGreaterThan(-1);
    }
    expect(identityProof).toBeLessThan(revokedReject);
    expect(revokedReject).toBeLessThan(serviceClient);
    expect(serviceClient).toBeLessThan(authorizationRead);
    expect(authorizationRead).toBeLessThan(quarantineRead);
    expect(quarantineRead).toBeLessThan(finalPublish);

    const identityStart = mediaFinalizer.indexOf("async function callerIdentity(");
    const persistStart = mediaFinalizer.indexOf("async function persistFinalization(");
    expect(identityStart).toBeGreaterThan(-1);
    expect(persistStart).toBeGreaterThan(identityStart);
    const identity = mediaFinalizer.slice(identityStart, persistStart);
    expect(identity).toContain("authenticated.auth.getUser(token)");
    expect(identity).toContain('authenticated.rpc("v3_assert_active_session")');
    expect(identity).toContain("activeError || active !== true");
  });

  it("keeps actor-bound media terminal authority tied to the same canonical session state", () => {
    expect(mediaAuthority).toContain("if v_row.actor_id is not null and not exists (");
    expect(mediaAuthority).toContain(
      "select 1 from auth.sessions where id=p_actor_session_id and user_id=v_row.actor_id",
    );
    expect(mediaAuthority).toContain("then raise exception 'SESSION_REVOKED'");
  });
});
