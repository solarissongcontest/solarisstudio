import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const client = readFileSync("src/lib/permission-engine-admin.ts", "utf8");
const route = readFileSync("src/routes/_authenticated/admin/access-permissions.tsx", "utf8");
const permissionCommands = readFileSync(
  "src/lib/organisation-permission-commands.test.ts",
  "utf8",
);
const highRisk = readFileSync(
  "src/lib/organisation-high-risk-operations-v5.test.ts",
  "utf8",
);

describe("V3 Organizer Access & Permissions building evidence", () => {
  it("reports Access & Permissions as building, never parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-access-permissions",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });

  it("keeps every browser permission mutation on the governed R3 command path", () => {
    expect(client).toContain('rpc("studio2_permission_change_preview"');
    expect(client).toContain('rpc("studio2_request_permission_change_approval"');
    expect(client).toContain('rpc("studio2_approve_permission_change"');
    expect(client).toContain('rpc("studio2_apply_permission_change_r3"');
    expect(client).not.toContain('rpc("studio2_assign_access_role"');
    expect(client).not.toContain('rpc("studio2_revoke_access_role"');
    expect(client).not.toContain('rpc("studio2_grant_capability"');
    expect(client).not.toContain('rpc("studio2_revoke_capability"');
  });

  it("retains R3 review, fresh auth, second-operator separation and expected-version evidence", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("previewPermissionChange(command)");
    expect(route).toContain('riskClass: "R3"');
    expect(route).toContain("reauthenticatePermissionR3");
    expect(route).toContain("Second-operator approvals");
    expect(route).toContain("approvalRequestId: approval.id");
    expect(client).toContain("p_expected_version: input.expectedVersion");
    expect(client).toContain("p_idempotency_key: input.idempotencyKey");
  });

  it("keeps stale-state, replay and hostile-path regression evidence in the suite", () => {
    expect(permissionCommands).toContain("authoritative per-user access revision");
    expect(permissionCommands).toContain("private.studio2_claim_operation");
    expect(permissionCommands).toContain("private.studio2_complete_operation");
    expect(highRisk).toContain("R3 requester cannot self-approve");
    expect(highRisk).toContain("R3 retry replays the canonical receipt");
    expect(highRisk).toContain("R3 replay does not duplicate permission grant");
    expect(highRisk).toContain("R3 approval rejects stale access version");
  });
});
