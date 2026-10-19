import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const administration = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const guide = readFileSync("src/routes/_authenticated/admin/guide.tsx", "utf8");
const syncHealthRoute = readFileSync("src/routes/_authenticated/admin/sync-health.tsx", "utf8");
const syncHealthServer = readFileSync(
  "src/integrations/unified/sync-health.functions.ts",
  "utf8",
);
const systemOperations = readFileSync(
  "src/routes/_authenticated/admin/system-operations.tsx",
  "utf8",
);
const operationContract = readFileSync(
  "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
  "utf8",
);

const IMPLEMENTED_WORKSPACE_CAPABILITIES = [
  "workspace-administration",
  "workspace-organizer-guide",
  "workspace-system-health",
  "workspace-delivery-jobs",
] as const;

describe("V3 Organizer implemented workspace building evidence", () => {
  it("reports the four implemented workspace surfaces as building without parity inflation", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    for (const id of IMPLEMENTED_WORKSPACE_CAPABILITIES) {
      const capability = byId.get(id);
      expect(capability, `${id} must remain represented in the registry`).toBeDefined();
      expect(capability?.migrationStatus).toBe("building");
      expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
    }
  });

  it("keeps Administration and Organizer Guide contextual and observational", () => {
    expect(administration).toContain('title="More"');
    expect(administration).toContain("All Organizer tools");
    expect(administration).not.toContain("useMutation(");
    expect(guide).toContain('title="Organizer guide"');
    expect(guide).toContain("Solaris Organizer is the private contest-management side");
    expect(guide).not.toContain("useMutation(");
  });

  it("keeps System Health a read-only diagnostic", () => {
    expect(syncHealthRoute).toContain("getUnifiedSyncHealth");
    expect(syncHealthRoute).not.toContain("useMutation(");
    expect(syncHealthServer).toContain('db.from("integration_events").select');
    expect(syncHealthServer).toContain('db.from("televoting_round_bindings").select');
    expect(syncHealthServer).not.toContain(".insert(");
    expect(syncHealthServer).not.toContain(".update(");
    expect(syncHealthServer).not.toContain(".delete(");
  });

  it("keeps failed-delivery retry on the canonical operation receipt path", () => {
    expect(systemOperations).toContain('command: "system.push.retry_failed"');
    expect(systemOperations).toContain("p_operation_id: operationId");
    expect(systemOperations).toContain("p_idempotency_key: idempotencyKey");
    expect(systemOperations).toContain("resolveSolarisV6OperationRecovery");
    expect(operationContract).toContain("private.studio2_claim_operation(");
    expect(operationContract).toContain("'system.push.retry_failed'");
    expect(operationContract).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(operationContract).toContain("Only failed notification deliveries can be retried");
  });

  it("keeps mutation-heavy platform surfaces outside this evidence claim", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );
    for (const id of [
      "workspace-feature-rollout",
      "workspace-all-editions",
      "workspace-hod-history",
      "workspace-system-settings",
    ]) {
      expect(byId.get(id)?.migrationStatus).toBe("planned");
    }
  });
});
