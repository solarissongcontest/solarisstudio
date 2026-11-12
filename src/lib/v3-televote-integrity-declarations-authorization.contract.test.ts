import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/televoting/integrity-declarations.server.ts",
  "utf8",
);
const permissions = readFileSync("src/lib/permissions-v2.ts", "utf8");
const foundation = readFileSync(
  "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
  "utf8",
);

describe("V3 Televote integrity declaration authorization", () => {
  it("requires an explicit edition before resolving the integrity capability", () => {
    const scopeValidation = server.indexOf(
      "Voting integrity declarations require an explicit edition scope",
    );
    const capability = server.indexOf(
      'await requireSolarisCapabilityServer("integrity.read", scopedEditionId);',
    );
    const privilegedClient = server.indexOf(
      'const tv = (supabaseAdmin as any).schema("televoting")',
    );

    expect(scopeValidation).toBeGreaterThan(-1);
    expect(capability).toBeGreaterThan(scopeValidation);
    expect(privilegedClient).toBeGreaterThan(capability);
  });

  it("does not rely on the broad merged Organizer compatibility identity", () => {
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
    expect(server).toContain("requireSolarisCapabilityServer");
  });

  it("keeps protected integrity evidence behind that capability boundary", () => {
    const capability = server.indexOf(
      'await requireSolarisCapabilityServer("integrity.read", scopedEditionId);',
    );
    const evidenceQuery = server.indexOf('from("vote_preflight_checks")');

    expect(evidenceQuery).toBeGreaterThan(capability);
    for (const field of [
      "hod_person_id",
      "relationship_risk",
      "risk_score",
      "findings",
      "technical_signals",
      "history_summary",
      "signed_name",
      "attestation_text",
    ]) {
      expect(server).toContain(field);
    }
  });

  it("retains edition-bound object validation after privileged reads", () => {
    expect(server).toContain(
      "Voting integrity declarations returned data outside the selected edition scope",
    );
    expect(server).toContain(
      "Voting integrity declaration references a round outside the selected edition scope",
    );
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain('.eq("id", scopedEditionId)');
  });

  it("uses the canonical Permission Engine integrity.read capability", () => {
    expect(permissions).toContain("'integrity.read'");
    expect(foundation).toContain(
      "('integrity.read', 'integrity', 'View integrity cases', 'View protected integrity reports, cases and evidence metadata.', 'read')",
    );
  });
});
