import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/integrations/televoting/moderation.server.ts", "utf8");
const adapters = readFileSync("src/integrations/televoting/moderation.functions.ts", "utf8");

const cases = [
  ["listMergedModerationSubmissions", "integrity.read"],
  ["setMergedSubmissionStatus", "integrity.manage"],
  ["softDeleteMergedSubmission", "integrity.manage"],
  ["restoreMergedSubmission", "integrity.manage"],
  ["updateMergedSubmissionNote", "integrity.manage"],
  ["editMergedSubmissionEntries", "integrity.manage"],
] as const;

function body(source: string, method: string) {
  const start = source.indexOf("export const " + method + " = createServerFn");
  if (start < 0) throw new Error("Missing function " + method);
  const next = source.indexOf("\nexport const ", start + method.length);
  return source.slice(start, next < 0 ? undefined : next);
}
function serverBody(method: string) {
  const start = server.indexOf("export async function " + method);
  if (start < 0) throw new Error("Missing server method " + method);
  const next = server.indexOf("\nexport async function ", start + method.length);
  return server.slice(start, next < 0 ? undefined : next);
}

describe("V3 Organizer Televote integrity moderation authority", () => {
  it("validates integrity.read/manage before compatibility organizer authentication", () => {
    const read = server.slice(server.indexOf("async function requireModerationReadServer()"), server.indexOf("async function requireModerationManageServer()"));
    const manage = server.slice(server.indexOf("async function requireModerationManageServer()"), server.indexOf("async function audit("));
    expect(read).toContain('requireSolarisCapabilityServer("integrity.read", null)');
    expect(manage).toContain('requireSolarisCapabilityServer("integrity.manage", null)');
    expect(read.indexOf("requireSolarisCapabilityServer(")).toBeLessThan(read.indexOf("requireMergedTelevotingAdminServer()"));
    expect(manage.indexOf("requireSolarisCapabilityServer(")).toBeLessThan(manage.indexOf("requireMergedTelevotingAdminServer()"));
  });

  it.each(cases)("protects %s with %s before importing privileged module", (method, capability) => {
    const adapter = body(adapters, method);
    expect(adapter).toContain('await requireModerationCapability("' + capability + '")');
    expect(adapter.indexOf("await requireModerationCapability")).toBeLessThan(adapter.indexOf('"@/integrations/televoting/moderation.server"'));
  });

  it("protects all raw server readers and writers, including the alerts count", () => {
    for (const name of ["listMergedModerationSubmissionsServer", "getMergedModerationAlertsCountServer"]) {
      const impl = serverBody(name);
      expect(impl).toContain("await requireModerationReadServer()");
    }
    for (const name of ["setMergedSubmissionStatusServer", "softDeleteMergedSubmissionServer", "restoreMergedSubmissionServer", "updateMergedSubmissionNoteServer", "editMergedSubmissionEntriesServer"]) {
      const impl = serverBody(name);
      expect(impl).toContain("await requireModerationManageServer()");
    }
  });

  it("fails closed on alert errors instead of misrepresenting errors as zero threats", () => {
    const alert = body(adapters, "getMergedModerationAlertsCount");
    expect(alert).toContain('await requireModerationCapability("integrity.read")');
    expect(alert).not.toContain("return 0");
    expect(alert).toContain("return getMergedModerationAlertsCountServer()");
  });

  it("preserves the existing moderation audit and bounded private ballot source", () => {
    expect(server).toContain('.from("admin_audit_log").insert(');
    expect(server).toContain(".limit(2500)");
    expect(server).toContain("moderator_note");
    expect(server).toContain("ip_country");
    expect(server).toContain("risk_score");
    expect(server).toContain("is_vpn");
    expect(adapters).not.toMatch(/\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  });
});
