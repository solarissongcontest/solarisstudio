import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/_authenticated/admin/incidents.tsx", "utf8");
const adapter = readFileSync("src/lib/v3-organizer-incident-operations.ts", "utf8");

function capability() {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find(
    (item) => item.legacyId === "operations-incidents",
  );
}

describe("V3 Organizer Incident Command route cutover", () => {
  it("keeps compatibility reads while removing compatibility mutation authority", () => {
    expect(route).toContain("studio2Persistence.listIncidents");
    expect(route).toContain("studio2Persistence.listEditionEvents");

    for (const legacyMutation of [
      "studio2Persistence.createIncidentFull",
      "studio2Persistence.acknowledgeIncident",
      "studio2Persistence.declareIncidentCrisis",
      "studio2Persistence.transitionIncident",
      "studio2Persistence.updateIncident",
      "studio2Persistence.addIncidentTimelineEvent",
    ]) {
      expect(route).not.toContain(legacyMutation);
    }
  });

  it("routes create and ordinary R1 changes through the governed Organizer adapter", () => {
    expect(route).toContain("prepareOrganizerIncidentOperation({");
    expect(route).toContain("commitOrganizerIncidentOperation({");
    expect(route).toContain("if (review.riskClass !== 'R1' || review.reasonRequired)");
    expect(route).toContain("action: 'create'");
    expect(route).toContain("action: 'acknowledge'");
    expect(route).toContain("action: 'update'");
    expect(route).toContain("action: 'timeline_note'");
  });

  it("binds every non-create commit to a fresh exact-edition canonical version", () => {
    expect(route).toContain("loadOrganizerIncidentCurrentState({ context, incidentId: incident.id })");
    expect(adapter).toContain("loadIncidentCommandProjection(editionId");
    expect(adapter).toContain("incidentId,");
    expect(adapter).toContain("version: requireVersion(incident.version)");
    expect(adapter).toContain("current.version !== review.expectedVersion");
    expect(adapter).toContain("Incident state changed after review");
  });

  it("uses authoritative preflight evidence for lifecycle review", () => {
    expect(route).toContain("pendingReview.review.riskClass");
    expect(route).toContain("pendingReview.review.requiredCapability");
    expect(route).toContain("pendingReview.review.expectedVersion");
    expect(route).toContain("pendingReview.review.consequences.map");
    expect(route).toContain("Server-authoritative consequences");
    expect(adapter).toContain("preflightIncidentCommand({");
  });

  it("collects mandatory R3 reason after authoritative preflight and before commit", () => {
    expect(adapter).not.toContain("if (preflight.reasonRequired && !reason)");
    expect(adapter).toContain("if (review.reasonRequired && !review.reason)");
    expect(route).toContain("Organizer reason (required)");
    expect(route).toContain("withOrganizerIncidentReviewReason(pending.review, pending.reason)");
    expect(route).toContain("pendingReview?.review.riskClass === 'R3'");
    expect(route).toContain("pendingReview?.review.reasonRequired && !pendingReview.reason.trim()");
  });

  it("does not fake atomic resolution with an update followed by a transition", () => {
    expect(route).toContain("const resolutionDirty =");
    expect(route).toContain("Save the incident record before resolving");
    expect(route).toContain("resolutionDirty ? 'Save record before resolving' : 'Review resolution'");
    expect(route).toContain("action: 'transition', payload: { to: 'resolved' }");
    expect(route).not.toContain("await studio2Persistence.updateIncident({ id: incident.id, resolution });");
    expect(route).not.toContain("await studio2Persistence.transitionIncident(incident.id, 'resolved');");
  });

  it("keeps Incident Command below parity while broader O12 acceptance remains unfinished", () => {
    expect(capability()).toBeDefined();
    expect(capability()?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability()?.migrationStatus);
  });
});
