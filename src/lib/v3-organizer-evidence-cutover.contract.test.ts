import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_ORGANIZER_EVIDENCE_CUTOVERS } from "./v3-organizer-cutover-evidence";

const organizerRoute = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
const organizerAccess = readFileSync("src/integrations/supabase/access.ts", "utf8");
const permissionFoundation = readFileSync(
  "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
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
const timeMachineSecurity = readFileSync(
  "src/lib/completion-products-security.integration.test.ts",
  "utf8",
);
const administration = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const guide = readFileSync("src/routes/_authenticated/admin/guide.tsx", "utf8");
const assistant = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
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

describe("V3 Organizer evidence-only cutovers", () => {
  it("binds every accepted evidence row to an actual cutover registry row", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    expect(EVIDENCE_IDS).toEqual([
      "current-edition-overview",
      "live-review-simulation-lab",
      "live-review-time-machine",
      "workspace-administration",
      "workspace-organizer-guide",
      "workspace-command-assistant",
    ]);

    for (const evidence of V3_ORGANIZER_EVIDENCE_CUTOVERS) {
      const capability = byId.get(evidence.id);
      expect(capability, `${evidence.id} must remain in the Organizer registry`).toBeDefined();
      expect(capability?.migrationStatus, `${evidence.id} requires accepted cutover status`).toBe(
        "cutover",
      );
      expect(capability?.ownerCapability).toBe(evidence.ownerCapability);
      expect(capability?.legacyRoutes).toEqual([evidence.route]);
      expect(evidence.implementationPaths.length).toBeGreaterThan(0);
      expect(evidence.authorityPaths.length).toBeGreaterThan(0);
      expect(evidence.acceptanceTests.length).toBeGreaterThan(0);
    }

    expect(EVIDENCE_IDS).not.toContain("voting-public-results");
  });

  it("proves the shared Organizer gate and edition.read authority instead of trusting a route label", () => {
    expect(organizerRoute).toContain("OrganizerAccessGate");
    expect(organizerRoute).toContain("hasSolarisOrganizerAccess(user.id)");
    expect(organizerRoute).toContain("return false");
    expect(organizerAccess).toContain('.in("role_key", ["organizer", "superadmin"])');
    expect(organizerAccess).toContain('.is("edition_id", null)');
    expect(permissionFoundation).toContain("from (values ('superadmin'), ('organizer')) as roles(role_key)");
    expect(permissionFoundation).toContain("cross join public.studio2_capabilities c");
  });

  it("accepts Overview only because the exact edition canonical projection is server-authorized", () => {
    expect(overview).toContain("const { editionId } = useAdminContext()");
    expect(overview).toContain("useV3OrganizerProjection(editionId || null)");
    expect(overview).toContain("!editionId");
    expect(overview).toContain('data-organizer-context-lock=""');
    expect(overviewServer).toContain('requireSolarisCapabilityServer("edition.read", editionId)');
    expectNoCanonicalMutation(overview);
  });

  it("accepts Simulation Lab only as an isolated local rehearsal seeded by an authorized read", () => {
    expect(simulator).toContain("const { editionId } = useAdminContext()");
    expect(simulator).toContain("getControlRoomModel");
    expect(simulator).toContain("createEditionSimulation");
    expect(simulator).toContain("applySimulationAction");
    expect(simulator).toContain("refetchOnWindowFocus: false");
    expect(simulator).toContain("refetchOnReconnect: false");
    expect(simulator).toContain("No production data will be changed.");
    expect(simulator).not.toContain("integrations/supabase/client");
    expect(controlRoomServer).toContain("requireSolarisCapabilityServer('edition.read', editionId)");
    expectNoCanonicalMutation(simulator);
  });

  it("accepts Time Machine only because its RPC is edition-authorized, read-only and bounded", () => {
    expect(timeMachine).toContain("const { editionId } = useAdminContext()");
    expect(timeMachine).toContain('rpc("studio2_time_machine"');
    expect(timeMachine).toContain("TIME_MACHINE_EVENT_LIMIT = 250");
    expect(timeMachine).toContain("TIME_MACHINE_AUDIT_LIMIT = 100");

    const start = completionProducts.indexOf(
      "create or replace function public.studio2_time_machine(",
    );
    const end = completionProducts.indexOf(
      "revoke all on function public.studio2_time_machine",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const rpc = completionProducts.slice(start, end);
    expect(rpc).toContain("studio2_access_allowed('edition.read', _edition_id, false)");
    expect(rpc).toContain("studio2_access_allowed('edition.manage', _edition_id, false)");
    expect(rpc).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from|public\.|[a-z_])/i);
    expect(timeMachineSecurity).toContain("keeps Time Machine read-only and bounded to recorded evidence");
    expectNoCanonicalMutation(timeMachine);
  });

  it("accepts Administration and Guide as contextual navigation/documentation with no data authority", () => {
    expect(administration).toContain('title="More"');
    expect(administration).toContain("All Organizer tools");
    expect(administration).not.toContain("useQuery(");
    expect(administration).not.toContain("integrations/supabase");
    expectNoCanonicalMutation(administration);

    expect(guide).toContain('title="How to use the organizer tools"');
    expect(guide).toContain("Solaris Organizer is the private contest-management side");
    expect(guide).not.toContain("useQuery(");
    expect(guide).not.toContain("integrations/supabase");
    expectNoCanonicalMutation(guide);
  });

  it("accepts Command Assistant only as a fixed read-only registry over the canonical projection", () => {
    expect(assistant).toContain("matchSolarisAssistantCommands");
    expect(assistant).toContain("useV3OrganizerProjection(resolvedEditionId || null)");
    expect(assistant).toContain("Read-only first");
    expect(assistant).toContain("cannot generate arbitrary SQL");
    expect(assistant).toContain("Read-only navigation");
    expect(assistant).not.toContain("integrations/supabase/client");
    expectNoCanonicalMutation(assistant);
  });
});
