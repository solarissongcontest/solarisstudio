import { describe, expect, it } from "vitest";

import {
  interventionRequiresAttestation,
  resolveIntegrityIntervention,
} from "@/integrations/televoting/integrity-policy";

describe("graduated integrity intervention", () => {
  it("does not turn mild statistical noise into an accusation", () => {
    expect(resolveIntegrityIntervention({ risk: 20, confidence: 90 })).toBe("none");
    expect(resolveIntegrityIntervention({ risk: 35, confidence: 20 })).toBe("notice");
  });

  it("requires corroborated risk before a declaration", () => {
    expect(resolveIntegrityIntervention({ risk: 50, confidence: 40, strongSignalCount: 1 })).toBe("review");
    expect(resolveIntegrityIntervention({ risk: 50, confidence: 40, strongSignalCount: 2 })).toBe("declaration");
    expect(resolveIntegrityIntervention({ risk: 65, confidence: 45 })).toBe("declaration");
  });

  it("reserves provisional review for exceptional current coordination evidence", () => {
    expect(resolveIntegrityIntervention({ risk: 95, confidence: 90, currentCoordinationEvidence: false })).toBe("enhanced_declaration");
    expect(resolveIntegrityIntervention({ risk: 95, confidence: 90, currentCoordinationEvidence: true })).toBe("provisional_review");
  });

  it("only requires a signature for declaration-level interventions", () => {
    expect(interventionRequiresAttestation("review")).toBe(false);
    expect(interventionRequiresAttestation("declaration")).toBe(true);
    expect(interventionRequiresAttestation("enhanced_declaration")).toBe(true);
    expect(interventionRequiresAttestation("provisional_review")).toBe(true);
  });
});
