import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moderation = readFileSync(
  "src/integrations/televoting/moderation.server.ts",
  "utf8",
);
const permissions = readFileSync("src/lib/permissions-v2.ts", "utf8");
const foundation = readFileSync(
  "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
  "utf8",
);

function section(start: string, end?: string) {
  const startIndex = moderation.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? moderation.indexOf(end, startIndex + start.length) : -1;
  return moderation.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe("Organizer V3 Televote moderation authorization", () => {
  it("uses canonical integrity capabilities before the merged admin compatibility session", () => {
    const readGuard = section(
      "async function requireModerationReadServer()",
      "async function requireModerationManageServer()",
    );
    const manageGuard = section(
      "async function requireModerationManageServer()",
      "async function audit(",
    );

    expect(readGuard).toContain(
      'await requireSolarisCapabilityServer("integrity.read", null);',
    );
    expect(manageGuard).toContain(
      'await requireSolarisCapabilityServer("integrity.manage", null);',
    );
    expect(readGuard.indexOf("requireMergedTelevotingAdminServer()"))
      .toBeGreaterThan(readGuard.indexOf("requireSolarisCapabilityServer"));
    expect(manageGuard.indexOf("requireMergedTelevotingAdminServer()"))
      .toBeGreaterThan(manageGuard.indexOf("requireSolarisCapabilityServer"));
  });

  it("requires integrity.read for protected moderation data", () => {
    const list = section(
      "export async function listMergedModerationSubmissionsServer",
      "export async function setMergedSubmissionStatusServer",
    );
    const alerts = section("export async function getMergedModerationAlertsCountServer");

    expect(list).toContain("await requireModerationReadServer();");
    expect(alerts).toContain("await requireModerationReadServer();");
    expect(list).toContain("ip_country");
    expect(list).toContain("is_vpn");
    expect(list).toContain("risk_score");
    expect(list).toContain("moderator_note");
  });

  it("requires integrity.manage for every consequential moderation mutation", () => {
    const mutations = [
      section(
        "export async function setMergedSubmissionStatusServer",
        "export async function softDeleteMergedSubmissionServer",
      ),
      section(
        "export async function softDeleteMergedSubmissionServer",
        "export async function restoreMergedSubmissionServer",
      ),
      section(
        "export async function restoreMergedSubmissionServer",
        "export async function updateMergedSubmissionNoteServer",
      ),
      section(
        "export async function updateMergedSubmissionNoteServer",
        "export async function editMergedSubmissionEntriesServer",
      ),
      section(
        "export async function editMergedSubmissionEntriesServer",
        "export async function getMergedModerationAlertsCountServer",
      ),
    ];

    for (const mutation of mutations) {
      expect(mutation).toContain("await requireModerationManageServer()");
      const guard = mutation.indexOf("requireModerationManageServer()");
      const firstRemoteAccess = mutation.indexOf("televotingAdmin");
      expect(guard).toBeGreaterThan(-1);
      expect(firstRemoteAccess).toBeGreaterThan(guard);
    }
  });

  it("does not leave direct generic-admin authorization inside moderation operations", () => {
    expect(moderation.match(/requireMergedTelevotingAdminServer\(\)/g)).toHaveLength(2);
    expect(moderation.match(/requireModerationManageServer\(\)/g)).toHaveLength(6);
    expect(moderation.match(/requireModerationReadServer\(\)/g)).toHaveLength(3);
  });

  it("matches the existing Permission Engine semantics for integrity read and manage", () => {
    expect(permissions).toContain("'integrity.read'");
    expect(permissions).toContain("'integrity.manage'");
    expect(foundation).toContain(
      "('integrity.read', 'integrity', 'View integrity cases', 'View protected integrity reports, cases and evidence metadata.', 'read')",
    );
    expect(foundation).toContain(
      "('integrity.manage', 'integrity', 'Manage integrity cases', 'Triage reports and manage investigations.', 'operate')",
    );
  });
});
