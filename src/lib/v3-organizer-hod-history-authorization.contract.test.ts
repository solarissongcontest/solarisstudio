import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function section(value: string, start: string, end?: string) {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? value.indexOf(end, startIndex + start.length) : -1;
  return value.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

const access = source("integrations/unified/hod-access.server.ts");
const functions = source("integrations/unified/hod-history.functions.ts");
const history = source("integrations/unified/hod-history.server.ts");
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

  it("guards direct HOD history server exports before any service-role read or mutation", () => {
    const read = section(
      history,
      "export async function getHodHistoryServer()",
      "export async function saveHodPersonServer",
    );
    const savePerson = section(
      history,
      "export async function saveHodPersonServer",
      "export async function saveHodAssignmentsServer",
    );
    const saveAssignments = section(
      history,
      "export async function saveHodAssignmentsServer",
      "export async function deleteHodAssignmentServer",
    );
    const removeAssignment = section(
      history,
      "export async function deleteHodAssignmentServer",
    );

    expect(read.indexOf('requireHodHistoryCapabilityServer("delegation.read")')).toBeGreaterThan(-1);
    expect(read.indexOf("loadHodResolverServer()")).toBeGreaterThan(
      read.indexOf('requireHodHistoryCapabilityServer("delegation.read")'),
    );

    for (const mutation of [savePerson, saveAssignments, removeAssignment]) {
      const guard = mutation.indexOf('requireHodHistoryCapabilityServer("delegation.manage")');
      const adminAccess = mutation.indexOf("const db = supabaseAdmin as any");
      expect(guard).toBeGreaterThan(-1);
      expect(adminAccess).toBeGreaterThan(guard);
    }
  });

  it("does not duplicate caller capability lookups in the thin TanStack server wrappers", () => {
    expect(functions).not.toContain("requireHodHistoryCapabilityServer");
    expect(functions).not.toContain("supabaseAdmin");
  });

  it("protects and narrows the raw televote-derived identity evidence query", () => {
    const guard = suggestions.indexOf('requireHodHistoryCapabilityServer("delegation.read")');
    const adminRead = suggestions.indexOf("const db = supabaseAdmin as any");
    const voteRead = suggestions.indexOf('.from("vote_submissions")');

    expect(guard).toBeGreaterThan(-1);
    expect(adminRead).toBeGreaterThan(guard);
    expect(voteRead).toBeGreaterThan(guard);
    expect(suggestions).not.toContain("requireSolarisOrganizerServer");
    expect(suggestions).toContain(
      '.select("round_id,country_code,username,username_normalized")',
    );
    expect(suggestions).toContain('.neq("status", "deleted")');
    expect(suggestions).not.toContain(
      '.select("id,round_id,country_code,username,username_normalized,status")',
    );
    expect(suggestions).not.toContain('submission.status === "deleted"');
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
