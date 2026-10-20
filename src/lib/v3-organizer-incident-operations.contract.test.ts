import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const organizer = source("src/lib/v3-organizer-incident-operations.ts");
const system = source("src/lib/v3-incident-command.ts");

describe("V3 Organizer Incident Command review boundary", () => {
  it("keeps Organizer review transport-free and delegates authority to System", () => {
    expect(organizer).toContain('from "@/lib/v3-incident-command"');
    expect(organizer).not.toContain("integrations/supabase");
    expect(organizer).not.toContain(".rpc(");
    expect(system).toContain('"studio2_incident_command_preflight"');
    expect(system).toContain('"studio2_apply_incident_command_v3"');
  });

  it("binds canonical preflight to the exact Organizer scope and action", () => {
    expect(organizer).toContain("input.preflight.editionId !== input.editionId");
    expect(organizer).toContain("(input.preflight.incidentId ?? null) !== input.incidentId");
    expect(organizer).toContain("input.preflight.action !== input.action");
    expect(organizer).toContain("preflightIncidentCommand({");
  });

  it("freezes the server-derived incident version for every non-create review", () => {
    expect(organizer).toContain('input.action === "create"');
    expect(organizer).toContain("requireVersion(preflight.expectedVersion)");
    expect(organizer).toContain("expectedVersion,");
  });

  it("refuses commit after Organizer context or incident version drift", () => {
    expect(organizer).toContain("review.editionId !== editionId");
    expect(organizer).toContain("current.editionId !== review.editionId");
    expect(organizer).toContain("current.incidentId !== review.incidentId");
    expect(organizer).toContain("current.version !== review.expectedVersion");
    expect(organizer).toContain("Incident state changed after review");
  });

  it("preserves server risk, capability and consequence evidence for the review surface", () => {
    expect(organizer).toContain("riskClass: preflight.riskClass");
    expect(organizer).toContain("requiredCapability: preflight.requiredCapability");
    expect(organizer).toContain("reasonRequired: preflight.reasonRequired");
    expect(organizer).toContain("consequences: [...preflight.consequences]");
  });

  it("fails closed when a server-required Organizer reason is missing", () => {
    expect(organizer).toContain("preflight.reasonRequired && !reason");
    expect(organizer).toContain("review.reasonRequired && !review.reason");
  });

  it("uses the reviewed version and delegates uncertain-outcome reconciliation to System", () => {
    expect(organizer).toContain("applyIncidentCommandV3({");
    expect(organizer).toContain("expectedVersion: review.expectedVersion");
    expect(system).toContain('"studio2_reconcile_operation"');
    expect(system).toContain("receipt?.operationId === command.operationId");
    expect(system).toContain('receipt.status === "succeeded"');
  });
});
