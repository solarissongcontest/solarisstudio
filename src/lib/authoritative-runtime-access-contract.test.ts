import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("authoritative runtime access", () => {
  const organizerServer = source("src/integrations/supabase/organizer.server.ts");
  const capabilitiesServer = source("src/integrations/supabase/capabilities.server.ts");
  const browserAccess = source("src/integrations/supabase/access.ts");
  const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
  const confirmationsAdmin = source("src/integrations/confirmations/admin.ts");
  const countryAccount = source("src/lib/country-account.ts");
  const data = source("src/lib/data.ts");
  const unifiedGate = source("src/components/admin/UnifiedServiceAdminGate.tsx");
  const passwordEdge = source("supabase/functions/admin-country-password/index.ts");
  const televotingServer = source("src/integrations/televoting/client.server.ts");
  const mergeStatus = source("MERGE_STATUS.md");

  it("uses active V2 role assignments for every Organizer runtime gate", () => {
    for (const runtime of [
      organizerServer,
      browserAccess,
      adminRoute,
      confirmationsAdmin,
      countryAccount,
      data,
      unifiedGate,
      passwordEdge,
    ]) {
      expect(runtime).not.toContain('.from("user_roles")');
      expect(runtime).not.toContain(".from('user_roles')");
    }

    expect(organizerServer).toContain('"studio2_role_assignments"');
    expect(browserAccess).toContain('"studio2_role_assignments"');
    expect(passwordEdge).toContain('"studio2_role_assignments"');
    expect(organizerServer).toContain('["organizer", "superadmin"]');
  });

  it("loads server capabilities from authoritative V2 assignments and direct grants", () => {
    expect(capabilitiesServer).toContain(".from('studio2_capability_grants')");
    expect(capabilitiesServer).toContain(".from('studio2_role_assignments')");
    expect(capabilitiesServer).toContain(".from('studio2_role_capabilities')");
    expect(capabilitiesServer).toContain("authoritative: true");
    expect(capabilitiesServer).not.toContain(".from('capability_grants')");
    expect(capabilitiesServer).not.toContain("legacyOrganizerFallback");
    expect(capabilitiesServer).not.toContain("legacyOrganizerCapabilities");
    expect(capabilitiesServer).not.toContain("user_roles");
  });

  it("keeps Televoting server access user-token based instead of service-role based", () => {
    expect(televotingServer).toContain("getSolarisAccessTokenServer");
    expect(televotingServer).toContain("Authorization: `Bearer ${token}`");
    expect(televotingServer).not.toContain("TELEVOTING_SUPABASE_SERVICE_ROLE_KEY");
    expect(mergeStatus).toContain("authenticated user's JWT");
    expect(mergeStatus).toContain("not a current Solaris Studio runtime dependency");
    expect(mergeStatus).not.toContain("declares that secret as required");
  });
});
