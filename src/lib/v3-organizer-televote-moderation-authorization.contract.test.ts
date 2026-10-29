import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moderation = readFileSync(
  "src/integrations/televoting/moderation.server.ts",
  "utf8",
);
const permissions = readFileSync("src/lib/permissions-v2.ts", "utf8");

function section(start: string, end?: string) {
  const startIndex = moderation.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? moderation.indexOf(end, startIndex + start.length) : -1;
  return moderation.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe("Organizer V3 Televote moderation authorization", () => {
  it("establishes named integrity capabilities before compatibility admin access", () => {
    const readGuard = section(
      "async function requireModerationReadServer()",
      "async function requireModerationManageServer()",
    );
    const manageGuard = section(
      "async function requireModerationManageServer()",
      "async function resolveSubmissionVersion",
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

  it("requires integrity.read before protected moderation evidence or alert reads", () => {
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

  it("requires integrity.manage before version lookup or governed moderation mutation", () => {
    const command = section(
      "async function applyModerationCommand(",
      "export async function listMergedModerationSubmissionsServer",
    );

    const guard = command.indexOf("await requireModerationManageServer();");
    const version = command.indexOf("resolveSubmissionVersion(");
    const mutation = command.indexOf('televotingAdmin.rpc("v3_moderate_submission"');

    expect(guard).toBeGreaterThan(-1);
    expect(version).toBeGreaterThan(guard);
    expect(mutation).toBeGreaterThan(version);
  });

  it("preserves the current versioned and idempotent moderation operation envelope", () => {
    expect(moderation).toContain('televotingAdmin.rpc("admin_submission_versions"');
    expect(moderation).toContain('televotingAdmin.rpc("v3_moderate_submission"');
    expect(moderation).toContain("p_expected_version: expectedVersion");
    expect(moderation).toContain("p_operation_id: data.operationId");
    expect(moderation).toContain("p_idempotency_key: data.idempotencyKey");
    expect(moderation).toContain("p_correlation_id: data.operationId");
    expect(moderation).not.toContain(".update(");
    expect(moderation).not.toContain(".insert(");
    expect(moderation).not.toContain(".delete(");
  });

  it("routes all five consequential actions through the single governed command", () => {
    for (const action of [
      '"set_status"',
      '"soft_delete"',
      '"restore"',
      '"update_note"',
      '"replace_entries"',
    ]) {
      expect(moderation).toContain(action);
    }
    expect(moderation.match(/return applyModerationCommand\(/g)).toHaveLength(5);
  });

  it("uses capabilities already defined by the Permission Engine", () => {
    expect(permissions).toContain("'integrity.read'");
    expect(permissions).toContain("'integrity.manage'");
  });
});
