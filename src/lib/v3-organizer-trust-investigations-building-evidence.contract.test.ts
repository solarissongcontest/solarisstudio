import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const queue = readFileSync(
  "src/routes/_authenticated/admin/integrity-investigations.tsx",
  "utf8",
);
const caseRoute = readFileSync(
  "src/routes/_authenticated/admin/integrity-case.$caseId.tsx",
  "utf8",
);
const resolution = readFileSync(
  "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx",
  "utf8",
);

describe("V3 Organizer Integrity Investigations building evidence", () => {
  it("reports the implemented investigations capability as building without claiming parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-investigations",
    );
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.targetDomain).toBe("governance");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });

  it("has a real triage queue linked to exact investigation and resolution workspaces", () => {
    expect(queue).toContain('title="Investigation desk"');
    expect(queue).toContain('rpc("admin_integrity_cases")');
    expect(queue).toContain('to="/admin/integrity-case/$caseId"');
    expect(queue).toContain('to="/admin/integrity-resolution/$caseId"');
    expect(queue).toContain("Evidence, findings & investigator independence");
  });

  it("covers evidence, rules, findings, reviewers, communications and the sanction/appeal handoff", () => {
    expect(caseRoute).toContain("<EvidencePanel detail={detail} refresh={refresh} />");
    expect(caseRoute).toContain("<RulesPanel detail={detail} refresh={refresh} />");
    expect(caseRoute).toContain("<FindingPanel detail={detail} refresh={refresh} />");
    expect(caseRoute).toContain("<ReviewerPanel");
    expect(caseRoute).toContain("<CommunicationPanel detail={detail} refresh={refresh} />");
    expect(resolution).toContain("IntegritySanctionDecisionReview");
    expect(resolution).toContain("IntegrityAppealDecisionReview");
  });

  it("keeps parity blocked while formal findings and precedent publication still mutate directly", () => {
    expect(caseRoute).toContain('rpc("admin_record_integrity_finding"');
    expect(caseRoute).toContain('rpc("admin_publish_integrity_decision"');
    expect(caseRoute).toContain('onClick={() => mutation.mutate()}');
  });
});
