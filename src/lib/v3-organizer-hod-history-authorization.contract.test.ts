import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const server = read("src/integrations/unified/hod-history.server.ts");
const functions = read("src/integrations/unified/hod-history.functions.ts");

describe("Organizer HOD history authorization", () => {
  it("guards browser history reads without breaking trusted Televote/HOD resolver callers", () => {
    const history = server.split("export async function getHodHistoryServer()")[1]?.split("const assignments: HodAssignment[]")[0] ?? "";
    const resolver = server.split("export async function loadHodResolverServer()")[1]?.split("export async function getHodHistoryServer()")[0] ?? "";

    expect(history).toContain('await requireSolarisCapabilityServer("delegation.read", null)');
    expect(history.indexOf('requireSolarisCapabilityServer("delegation.read", null)')).toBeLessThan(
      history.indexOf('loadHodResolverServer()'),
    );
    expect(resolver).not.toContain('loadServiceRoleDbAfterCapability("delegation.read", null)');
    expect(resolver).toContain('await import("@/integrations/supabase/client.server")');
    expect(read("src/integrations/televoting/canonical-context.server.ts")).toContain("loadHodResolverServer()");
    expect(read("src/integrations/unified/hod-suggestions.server.ts")).toContain("loadHodResolverServer()");
  });

  it("requires global delegation.manage before shared HOD identity writes", () => {
    const savePerson = server.split("export async function saveHodPersonServer")[1]?.split("export async function saveHodAssignmentsServer")[0] ?? "";

    const capability = 'loadServiceRoleDbAfterCapability("delegation.manage", null)';
    expect(savePerson).toContain(capability);
    expect(savePerson.indexOf(capability)).toBeLessThan(savePerson.indexOf('.from("delegation_people")'));
    expect(savePerson).toContain('.update(values)');
    expect(savePerson).toContain('.insert({');
  });

  it("authorizes every Edition in an assignment range before importing the service-role client", () => {
    const saveAssignments = server.split("export async function saveHodAssignmentsServer")[1]?.split("export async function deleteHodAssignmentServer")[0] ?? "";

    expect(saveAssignments).toContain('editionIds.map((editionId) =>');
    expect(saveAssignments).toContain('requireSolarisCapabilityServer("delegation.manage", editionId)');
    expect(saveAssignments).toContain('await Promise.all(');
    expect(saveAssignments.indexOf('await Promise.all(')).toBeLessThan(
      saveAssignments.indexOf('await import("@/integrations/supabase/client.server")'),
    );
    expect(saveAssignments.indexOf('await import("@/integrations/supabase/client.server")')).toBeLessThan(
      saveAssignments.indexOf('.upsert(rows'),
    );
  });

  it("derives delete scope server-side and rechecks edition-scoped manage before deletion", () => {
    const remove = server.split("export async function deleteHodAssignmentServer")[1] ?? "";

    expect(remove).toContain('loadServiceRoleDbAfterCapability("delegation.read", null)');
    expect(remove).toContain('.select("id,edition_id")');
    expect(remove).toContain('.eq("id", assignmentId)');
    expect(remove).toContain('const editionId = String(assignment.edition_id)');
    expect(remove).toContain('requireSolarisCapabilityServer("delegation.manage", editionId)');
    expect(remove).toContain('.eq("edition_id", editionId)');

    const lookup = remove.indexOf('.select("id,edition_id")');
    const scopedManage = remove.indexOf('requireSolarisCapabilityServer("delegation.manage", editionId)');
    const deletion = remove.indexOf('.delete()');
    expect(lookup).toBeGreaterThan(-1);
    expect(scopedManage).toBeGreaterThan(lookup);
    expect(deletion).toBeGreaterThan(scopedManage);
  });

  it("does not accept caller actor identity and records resolved delete Edition in audit", () => {
    expect(server).not.toContain("actorId");
    expect(server).not.toContain("userId:");
    expect(functions).toContain("editionId: result.editionId");
    expect(functions).toContain('action: "hod_assignment.delete"');
  });
});
