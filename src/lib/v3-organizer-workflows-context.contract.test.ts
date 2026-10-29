import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflows = source("src/routes/_authenticated/admin/workflows.tsx");
const adminOps = source("src/lib/admin-ops.ts");

describe("V3 Organizer Workflows exact-edition safety", () => {
  it("never substitutes a newest or globally active edition", () => {
    expect(workflows).toContain("selectOrganizerEdition(editions, editionId)");
    expect(workflows).not.toContain("[...editions].sort");
    expect(workflows).toContain("Solaris will not substitute the newest or globally active edition");
  });

  it("uses a fail-closed deadline reader instead of an all-edition browser query", () => {
    expect(workflows).toContain("useEditionAdminDeadlines(resolvedEditionId || null)");
    expect(adminOps).toContain("export function useEditionAdminDeadlines");
    expect(adminOps).toContain("enabled: Boolean(normalizedEditionId)");
    expect(adminOps).toContain('["admin-deadlines", normalizedEditionId ?? "unscoped"]');
    expect(adminOps).toContain("Edition deadlines require an explicit Organizer edition scope.");
    expect(adminOps).toContain("loadAdminDeadlines(normalizedEditionId)");
  });

  it("keeps every browser deadline reader bounded to an explicit edition", () => {
    expect(adminOps).toContain("export function useAdminDeadlines(editionId?: string | null)");
    expect(adminOps).not.toContain('["admin-deadlines", editionId ?? "all"]');
    expect(adminOps).toContain("Admin deadlines require an explicit Organizer edition scope.");
    expect(adminOps).toContain('.eq("edition_id", normalizedEditionId)');
  });

  it("uses canonical Studio 2 runtime independently of the Control Room presentation flag", () => {
    expect(workflows).toContain("loadStudio2ControlRoomSnapshot(resolvedEditionId, undefined, 100)");
    expect(workflows).toContain("isStudio2FeatureEnabled('workflow_engine', resolvedEditionId)");
    expect(workflows).not.toContain("isStudio2FeatureEnabled('live_control_room'");
    expect(workflows).not.toContain("studio2ControlRoom.loadSnapshot");
  });

  it("fails closed instead of synthesizing operational truth from legacy edition status", () => {
    expect(workflows).toContain("const runtime = snapshotQuery.data?.runtime.runtime ?? null");
    expect(workflows).toContain("Workflows could not load canonical state");
    expect(workflows).not.toContain("normalizeLegacyEditionStatus");
    expect(workflows).not.toContain("defaultSubsystemStatesForEdition");
    expect(workflows).not.toContain("Compatibility runtime in use");
  });

  it("marks the implemented Workflows slice building without overstating parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "operations-workflows",
    );
    expect(capability?.targetDomain).toBe("tasks-operations");
    expect(capability?.migrationStatus).toBe("building");
  });
});