import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const access = source("integrations/unified/hod-access.server.ts");
const functions = source("integrations/unified/hod-history.functions.ts");
const suggestions = source("integrations/unified/hod-suggestions.server.ts");
const routeMap = source("lib/permission-route-map.ts");
const rls = source("../supabase/migrations/20260914174742_permission_engine_v2_core_rls_cutover.sql");

describe("Organizer HOD history authorization boundary", () => {
  it("verifies the caller capability with the authenticated request client and fails closed", () => {
    expect(access).toContain("createSolarisAuthenticatedClientServer");
    expect(access).toContain('client.rpc("studio2_access_allowed"');
    expect(access).toContain("p_capability: capability");
    expect(access).toContain("p_edition_id: editionId");
    expect(access).toContain("p_strict_before_cutover: true");
    expect(access).toContain("if (error)");
    expect(access).toContain("if (allowed !== true)");
    expect(access).not.toContain("supabaseAdmin");
  });

  it("keeps reads on delegation.read and mutations on delegation.manage before service helpers are imported", () => {
    const historyRead = functions.indexOf('requireHodHistoryCapabilityServer("delegation.read")');
    const suggestionsRead = functions.indexOf(
      'requireHodHistoryCapabilityServer("delegation.read")',
      historyRead + 1,
    );
    const firstManage = functions.indexOf('requireHodHistoryCapabilityServer("delegation.manage")');
    const firstHistoryImport = functions.indexOf(
      'import("@/integrations/unified/hod-history.server")',
    );

    expect(historyRead).toBeGreaterThan(-1);
    expect(suggestionsRead).toBeGreaterThan(historyRead);
    expect(firstManage).toBeGreaterThan(suggestionsRead);
    expect(firstHistoryImport).toBeGreaterThan(historyRead);
    expect(functions.match(/requireHodHistoryCapabilityServer\("delegation\.manage"\)/g)).toHaveLength(3);
  });

  it("protects the raw televote-derived identity suggestion reader even when called outside its route wrapper", () => {
    const guard = suggestions.indexOf('requireHodHistoryCapabilityServer("delegation.read")');
    const adminRead = suggestions.indexOf("const db = supabaseAdmin as any");
    const voteRead = suggestions.indexOf('.from("vote_submissions")');

    expect(guard).toBeGreaterThan(-1);
    expect(adminRead).toBeGreaterThan(guard);
    expect(voteRead).toBeGreaterThan(guard);
    expect(suggestions).not.toContain("requireSolarisOrganizerServer");
  });

  it("matches the existing route and database Permission Engine contract instead of inventing a second authority", () => {
    expect(routeMap).toContain('"/admin/hod-history"');
    expect(routeMap).toContain('"delegation.read"');
    expect(rls).toContain(
      "using (public.studio2_access_allowed('delegation.manage', edition_id, true))",
    );
    expect(rls).toContain(
      "with check (public.studio2_access_allowed('delegation.manage', edition_id, true))",
    );
  });
});
