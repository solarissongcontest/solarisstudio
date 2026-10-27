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

  it("makes explicit sign-out global and synchronously fences private client cache after success", () => {
    const signOut = read("src/lib/account-session.ts");
    const isolation = read("src/components/app/AccountCacheIsolation.tsx");
    expect(signOut).toContain('supabase.auth.signOut({ scope: "global" })');
    expect(signOut.indexOf("if (error) throw error")).toBeLessThan(
      signOut.indexOf("publishSolarisSignOutBoundary()"),
    );
    expect(isolation).toContain("subscribeSolarisSignOutBoundary");
    expect(isolation).toContain("applySession(null)");
    expect(read("src/lib/account-cache-isolation.ts")).toContain("clearPrivateAccountQueries(client)");
  });

  it("does not race a second preference identity restoration against auth lifecycle events", () => {
    const preferences = read("src/components/app/AppExperiencePreferenceSync.tsx");
    expect(preferences).toContain("onAuthStateChange");
    expect(preferences).not.toContain("supabase.auth.getUser()");
    expect(preferences).toContain("beginLifecycleGeneration(authGenerationRef)");
  });

  it.each(["identity.authenticated", "identity.signed_out"])(
    "treats %s events as observational consequences, not authentication authority",
    (event) => {
      expect(classifyV3ConsequenceRelease(event)).toBe("observational_or_pure_read");
      expect(
        classifyV3ReleaseFinding(`DOMAIN_CONSEQUENCE_DECLARED ${event} owner=identity`).releaseRisk,
      ).toBe("tracked_migration_debt");
    },
  );
});
