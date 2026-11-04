import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_ORGANIZER_EVIDENCE_CUTOVERS } from "./v3-organizer-cutover-evidence";

const organizerRoute = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
const organizerAccess = readFileSync("src/integrations/supabase/access.ts", "utf8");
const organizerFlagMigration = readFileSync(
  "supabase/migrations/20261014142000_v3_organizer_cutover.sql",
  "utf8",
);
const overview = readFileSync("src/routes/_authenticated/admin/operations.tsx", "utf8");
const overviewServer = readFileSync("src/lib/organizer-v3-projection.server.ts", "utf8");
const simulator = readFileSync("src/routes/_authenticated/admin/edition-simulator.tsx", "utf8");
const controlRoomServer = readFileSync("src/lib/control-room.server.ts", "utf8");
const timeMachine = readFileSync("src/routes/_authenticated/admin/time-machine.tsx", "utf8");
const completionProducts = readFileSync(
  "supabase/migrations/20260920104806_completion_products.sql",
  "utf8",
);
const hostClient = readFileSync("src/lib/studio2-host-management.ts", "utf8");
const hostMigration = readFileSync(
  "supabase/migrations/20260912171500_studio2_host_management.sql",
  "utf8",
);
const storytellingClient = readFileSync("src/lib/studio2-storytelling.ts", "utf8");
const storytellingMigration = readFileSync(
  "supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql",
  "utf8",
);
const communityRoute = readFileSync(
  "src/routes/_authenticated/admin/community-moderation.tsx",
  "utf8",
);
const communityMigration = readFileSync(
  "supabase/migrations/20261002200000_organisation_os_v5_community_moderation.sql",
  "utf8",
);
const operationContract = readFileSync(
  "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
  "utf8",
);
const administration = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const guide = readFileSync("src/routes/_authenticated/admin/guide.tsx", "utf8");
const assistant = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
  "utf8",
);
const permissionFoundation = readFileSync(
  "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
  "utf8",
);
const permissionRouteMap = readFileSync("src/lib/permission-route-map.ts", "utf8");
const televoteAdminSession = readFileSync(
  "src/integrations/televoting/admin-session.server.ts",
  "utf8",
);

const EVIDENCE_IDS = V3_ORGANIZER_EVIDENCE_CUTOVERS.map((row) => row.id);

function expectNoCanonicalMutation(source: string) {
  expect(source).not.toContain("useMutation(");
  expect(source).not.toContain(".insert(");
  expect(source).not.toContain(".update(");
  expect(source).not.toContain(".delete(");
  expect(source).not.toContain(".upsert(");
}

describe("V3 Organizer item-specific release evidence", () => {
  it("promotes proven rows to parity but refuses to claim production cutover while the rollout starts dark", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    expect(EVIDENCE_IDS).toEqual([
      "current-edition-overview",
      "current-edition-host",
      "current-edition-storytelling",
      "live-review-simulation-lab",
      "live-review-time-machine",
      "workspace-administration",
      "workspace-organizer-guide",
      "workspace-community-moderation",
      "workspace-command-assistant",
      "workspace-beta-3-feedback",
      "workspace-beta-2-feedback",
      "workspace-beta-1-archive",
    ]);

    for (const evidence of V3_ORGANIZER_EVIDENCE_CUTOVERS) {
      const capability = byId.get(evidence.id);
      expect(capability, `${evidence.id} must remain in the Organizer registry`).toBeDefined();
      expect(capability?.migrationStatus, `${evidence.id} has parity evidence, not rollout evidence`).toBe(
        "parity",
      );
      expect(capability?.ownerCapability).toBe(evidence.ownerCapability);
      expect(capability?.legacyRoutes).toEqual([evidence.route]);
      expect(evidence.implementationPaths.length).toBeGreaterThan(0);
      expect(evidence.authorityPaths.length).toBeGreaterThan(0);
      expect(evidence.acceptanceTests.length).toBeGreaterThan(0);
    }

    expect(organizerFlagMigration).toContain("'solaris_app_v3_organizer', false, true");
    expect(EVIDENCE_IDS).not.toContain("voting-public-results");
  });

  it("proves the shared Organizer access gate instead of treating the route map as authorization", () => {
    expect(organizerRoute).toContain("OrganizerAccessGate");
    expect(organizerRoute).toContain("hasSolarisOrganizerAccess(user.id)");
    expect(organizerAccess).toContain('.in("role_key", ["organizer", "superadmin"])');
    expect(organizerAccess).toContain('.is("edition_id", null)');
  });

  it("proves Overview through its exact-edition canonical projection", () => {
    expect(overview).toContain("const { editionId } = useAdminContext()");
    expect(overview).toContain("useV3OrganizerProjection(editionId || null)");
    expect(overviewServer).toContain('requireSolarisCapabilityServer("edition.read", editionId)');
    expectNoCanonicalMutation(overview);
  });

  it("proves Simulation Lab as local-only rehearsal seeded from an authorized edition read", () => {
    expect(simulator).toContain("createEditionSimulation");
    expect(simulator).toContain("applySimulationAction");
    expect(simulator).toContain("No production data will be changed.");
    expect(simulator).not.toContain("integrations/supabase/client");
    expect(controlRoomServer).toContain("requireSolarisCapabilityServer('edition.read', editionId)");
    expectNoCanonicalMutation(simulator);
  });

  it("proves Time Machine is bounded, read-only and edition-authorized", () => {
    expect(timeMachine).toContain("TIME_MACHINE_EVENT_LIMIT = 250");
    expect(timeMachine).toContain("TIME_MACHINE_AUDIT_LIMIT = 100");
    const start = completionProducts.indexOf(
      "create or replace function public.studio2_time_machine(",
    );
    const end = completionProducts.indexOf("revoke all on function public.studio2_time_machine", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const rpc = completionProducts.slice(start, end);
    expect(rpc).toContain("studio2_access_allowed('edition.read', _edition_id, false)");
    expect(rpc).toContain("studio2_access_allowed('edition.manage', _edition_id, false)");
    expect(rpc).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from|public\.|[a-z_])/i);
  });

  it("proves Host Management with separate read/manage authority and replay-safe revisioned operations", () => {
    expect(hostClient).toContain("rpc('studio2_host_management_snapshot'");
    expect(hostClient).toContain("rpc('studio2_execute_host_operation'");
    expect(hostClient).toContain("expectedRevision");
    expect(hostClient).toContain("pendingHostExecutionIds");
    expect(hostMigration).toContain("'Missing Solaris capability: host.read'");
    expect(hostMigration).toContain("'Missing Solaris capability: host.manage'");
    expect(hostMigration).toContain("pg_advisory_xact_lock");
  });

  it("proves Storytelling with separate read/manage authority and replay-safe revisioned operations", () => {
    expect(storytellingClient).toContain("pendingStoryExecutionIds");
    expect(storytellingClient).toContain("expectedRevision");
    expect(storytellingClient).toContain("validateStoryOperationExecution");
    expect(storytellingMigration).toContain("'Missing Solaris capability: story.read'");
    expect(storytellingMigration).toContain("'Missing Solaris capability: story.manage'");
    expect(storytellingMigration).toContain("pg_advisory_xact_lock");
  });

  it("proves Administration, Guide and Command Assistant remain non-authoritative helper surfaces", () => {
    expect(administration).toContain("All Organizer tools");
    expect(administration).not.toContain("integrations/supabase");
    expectNoCanonicalMutation(administration);
    expect(guide).toContain("Solaris Organizer is the private contest-management side");
    expect(guide).not.toContain("integrations/supabase");
    expectNoCanonicalMutation(guide);
    expect(assistant).toContain("useV3OrganizerProjection(resolvedEditionId || null)");
    expect(assistant).toContain("cannot generate arbitrary SQL");
    expect(assistant).toContain("Read-only navigation");
    expect(assistant).not.toContain("integrations/supabase/client");
    expectNoCanonicalMutation(assistant);
  });

  it("proves Community Moderation read/mutation authority and operation reconciliation", () => {
    expect(communityMigration).toContain("studio2_access_allowed('community.read', null, false)");
    expect(operationContract).toContain("studio2_access_allowed('community.moderate', null, false)");
    expect(operationContract).toContain("'community.fan_identity.moderate'");
    expect(operationContract).toContain("private.studio2_claim_operation");
    expect(operationContract).toContain("private.studio2_complete_operation");
    expect(communityRoute).toContain("p_operation_id: operationId");
    expect(communityRoute).toContain("p_idempotency_key: idempotencyKey");
    expect(communityRoute).toContain("resolveSolarisV6OperationRecovery");
  });

  it("refuses evidence inflation when registry ownership and server authority do not match", () => {
    const permissions = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-access-permissions",
    );
    expect(permissions?.ownerCapability).toBe("permissions.read");
    expect(permissions?.migrationStatus).toBe("building");
    expect(permissionFoundation).toContain("create or replace function public.studio2_access_users()");
    expect(permissionFoundation).toContain("private.studio2_can_manage_permissions(v_actor)");

    expect(permissionRouteMap).toContain('rule(["/televoting/admin"], "voting.read")');
    expect(televoteAdminSession).toContain("requireSolarisOrganizerServer()");
    expect(televoteAdminSession).not.toContain("voting.read");
    for (const id of [
      "voting-intelligence",
      "voting-analytics",
      "voting-audit-log",
      "voting-result-backtest",
      "voting-anti-abuse",
    ]) {
      const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === id);
      expect(capability?.migrationStatus).toBe("building");
      expect(EVIDENCE_IDS).not.toContain(id);
    }
  });
});
