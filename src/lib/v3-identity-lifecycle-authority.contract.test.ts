import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyV3ConsequenceRelease } from "./v3-consequence-release-classification";
import { classifyV3ReleaseFinding } from "./v3-release-risk";

const read = (path: string) => readFileSync(path, "utf8");
const storageBoundary = read(
  "supabase/migrations/20261027184500_v3_identity_storage_session_boundary.sql",
);

describe("identity authentication and sign-out authority", () => {
  it("keeps authentication authority on verified server identity rather than cached users", () => {
    const route = read("src/routes/_authenticated/route.tsx");
    const organizer = read("src/components/admin/UnifiedServiceAdminGate.tsx");
    for (const source of [route, organizer]) {
      expect(source).toContain("auth.getUser()");
      expect(source).toContain("sessionUserId");
      expect(source).toContain("user.id !== sessionUserId");
    }

    const accountAuth = read("src/lib/country-auth.ts");
    expect(accountAuth).toContain("data.session.user.id !== payload.userId");
    expect(accountAuth).toContain("verified.user.id !== payload.userId");
    expect(accountAuth).toContain("beginSolarisAuthTransition()");
    expect(accountAuth).toContain("runSolarisAuthMutation(");

    const reauth = read("src/lib/reauthenticate-solaris-account.ts");
    expect(reauth).toContain("beginSolarisAuthTransition()");
    expect(reauth).toContain("runSolarisAuthMutation(");
    expect(reauth).toContain("before.user.id !== originalUserId");
    expect(reauth).toContain("verified.user.id !== originalUserId");
    for (const path of [
      "src/lib/platform-operational-mode.ts",
      "src/lib/show-publication-lifecycle.ts",
      "src/lib/permission-engine-admin.ts",
    ]) {
      expect(read(path)).toContain("reauthenticateCurrentSolarisAccount");
      expect(read(path)).not.toContain("supabase.auth.signInWithPassword");
    }

    for (const path of [
      "src/integrations/supabase/organizer.server.ts",
      "src/integrations/v3/entry-actions.server.ts",
      "src/integrations/v3/jury-actions.server.ts",
      "src/integrations/v3/primary-surface-source.server.ts",
      "supabase/functions/admin-country-password/index.ts",
      "supabase/functions/integrity-evidence-download/index.ts",
      "supabase/functions/solaris-upload-finalize/index.ts",
    ]) {
      expect(read(path)).toMatch(/auth\.getUser\(token\)/);
    }
  });

  it("binds authenticated Storage authority to canonical auth.sessions", () => {
    expect(storageBoundary).toContain("private.v3_require_active_auth_session()");
    expect(storageBoundary).toContain("private.v3_storage_authenticated_session_active()");
    expect(storageBoundary).toContain("if p_actor is not null");
    expect(storageBoundary).toContain("studio2_upload_quarantine_path_allowed");
    for (const policy of [
      "Organizers can read beta screenshots",
      "country media bucket owner delete",
      "organizers delete edition artwork",
      "country fonts owner delete",
    ]) {
      const start = storageBoundary.indexOf(`create policy \"${policy}\"`);
      expect(start).toBeGreaterThan(-1);
      expect(storageBoundary.slice(start, start + 900)).toContain(
        "private.v3_storage_authenticated_session_active()",
      );
    }
  });

  it("makes explicit sign-out global, serialized, and synchronously fences private client cache", () => {
    const signOut = read("src/lib/account-session.ts");
    const isolation = read("src/components/app/AccountCacheIsolation.tsx");
    expect(signOut).toContain('supabase.auth.signOut({ scope: "global" })');
    expect(signOut).toContain("beginSolarisAuthTransition()");
    expect(signOut).toContain("runSolarisAuthMutation(transition");
    expect(signOut.indexOf("runSolarisAuthMutation")).toBeLessThan(
      signOut.indexOf("publishSolarisSignOutBoundary()"),
    );
    expect(isolation).toContain("subscribeSolarisSignOutBoundary");
    expect(isolation).toContain("applySession(null)");
    expect(read("src/lib/account-cache-isolation.ts")).toContain("clearPrivateAccountQueries(client)");

    const appShell = read("src/components/AppShell.tsx");
    expect(appShell).toContain("signOutSolarisAccount");
    expect(appShell).not.toContain("supabase.auth.signOut");
    const confirmationSettings = read("src/routes/confirmations/admin/settings.tsx");
    expect(confirmationSettings).toContain("signOutSolarisAccount");
    expect(confirmationSettings).not.toContain("auth.signOut");
  });

  it("does not race duplicate identity restoration or late account-scoped presentation reads", () => {
    const preferences = read("src/components/app/AppExperiencePreferenceSync.tsx");
    expect(preferences).toContain("onAuthStateChange");
    expect(preferences).not.toContain("supabase.auth.getUser()");
    expect(preferences).toContain("beginLifecycleGeneration(authGenerationRef)");

    const appShell = read("src/components/AppShell.tsx");
    expect(appShell).toContain("let authGeneration = 0");
    expect(appShell).toContain("generation !== authGeneration");
    expect(appShell).toContain("setAccess(EMPTY_ACCESS)");
    expect(appShell).not.toContain("void supabase.auth\n      .getUser()");
  });

  it("makes the isolated maintenance portal prove identity and reject stale lifecycle responses", () => {
    const maintenance = read("src/lib/maintenance-hod-portal.ts");
    expect(maintenance).toContain("let authGeneration = 0");
    expect(maintenance).toContain("requestGeneration !== authGeneration");
    expect(maintenance).toContain("sessionResult.data.session.user.id !== authResult.data.userId");
    expect(maintenance).toContain("verified.data.user.id !== authResult.data.userId");
    expect(maintenance).toContain('client.auth.signOut({ scope: "global" })');
    expect(maintenance).toContain("Sign out did not complete. Your Solaris session is still active.");
  });

  it("rejects revoked media actors before service-role reads or Storage publication", () => {
    const finalizer = read("supabase/functions/solaris-upload-finalize/index.ts");
    const handler = finalizer.slice(finalizer.indexOf("Deno.serve(async (request) =>"));
    const identityProof = handler.indexOf("await callerIdentity(supabaseUrl, anonKey, authorization)");
    const revokedReject = handler.indexOf("if (caller.revoked)");
    const serviceClient = handler.indexOf("createClient(supabaseUrl, serviceRoleKey");
    const authorizationRead = handler.indexOf('.from("studio2_upload_authorizations")');
    const publish = handler.indexOf(".upload(row.final_path, finalBlob");
    expect(identityProof).toBeGreaterThan(-1);
    expect(revokedReject).toBeGreaterThan(identityProof);
    expect(serviceClient).toBeGreaterThan(revokedReject);
    expect(authorizationRead).toBeGreaterThan(serviceClient);
    expect(publish).toBeGreaterThan(authorizationRead);

    const identityStart = finalizer.indexOf("async function callerIdentity(");
    const persistStart = finalizer.indexOf("async function persistFinalization(");
    const identity = finalizer.slice(identityStart, persistStart);
    expect(identity).toContain('authenticated.rpc("v3_assert_active_session")');
  });

  it.each(["identity.authenticated", "identity.signed_out"])(
    "treats %s as observational consequence debt rather than authentication authority",
    (event) => {
      expect(classifyV3ConsequenceRelease(event)).toBe("observational_or_pure_read");
      expect(
        classifyV3ReleaseFinding(`DOMAIN_CONSEQUENCE_DECLARED ${event} owner=identity`).releaseRisk,
      ).toBe("tracked_migration_debt");
    },
  );
});
