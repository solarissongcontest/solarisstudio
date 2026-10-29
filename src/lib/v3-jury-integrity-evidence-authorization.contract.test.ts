import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/jury-voting/jury-integrity-admin.server.ts",
  "utf8",
);
const foundation = readFileSync(
  "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
  "utf8",
);

describe("V3 Jury integrity evidence authorization", () => {
  it("requires explicit edition scope and integrity.read before service-role access", () => {
    const scope = server.indexOf("Jury Integrity requires an explicit edition scope");
    const capability = server.indexOf(
      'await requireSolarisCapabilityServer("integrity.read", scopedEditionId);',
    );
    const privilegedClient = server.indexOf("const db = supabaseAdmin as any");

    expect(scope).toBeGreaterThan(-1);
    expect(capability).toBeGreaterThan(scope);
    expect(privilegedClient).toBeGreaterThan(capability);
  });

  it("does not rely on the broad merged Organizer compatibility identity", () => {
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
    expect(server).toContain("requireSolarisCapabilityServer");
  });

  it("keeps protected HOD, risk and model evidence behind the capability boundary", () => {
    const capability = server.indexOf(
      'await requireSolarisCapabilityServer("integrity.read", scopedEditionId);',
    );
    const evidenceQuery = server.indexOf('from("vote_preflight_checks")');

    expect(evidenceQuery).toBeGreaterThan(capability);
    for (const field of [
      "hod_person_id",
      "relationship_risk",
      "risk_score",
      "confidence",
      "admin_evidence",
      "intervention_level",
      "attested_at",
      "submitted_at",
    ]) {
      expect(server).toContain(field);
    }
  });

  it("retains edition and show object-scope validation", () => {
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain('.eq("edition_id", scopedEditionId)');
    expect(server).toContain(
      "Jury Integrity returned evidence outside the selected edition scope",
    );
    expect(server).toContain(
      "Jury Integrity evidence references a show outside the selected edition scope",
    );
  });

  it("uses the Permission Engine capability intended for protected integrity evidence", () => {
    expect(foundation).toContain(
      "('integrity.read', 'integrity', 'View integrity cases', 'View protected integrity reports, cases and evidence metadata.', 'read')",
    );
  });
});
