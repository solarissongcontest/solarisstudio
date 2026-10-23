import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-disclosure.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-evidence.ts", "utf8");

describe("V3 Organizer evidence disclosure release preview", () => {
  it("routes reporter-visible derivatives through an explicit frozen release review", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("type DisclosureCreationInput");
    expect(route).toContain("setReleaseReview(input)");
    expect(route).toContain("open={Boolean(releaseReview)}");
    expect(route).toContain('title="Release this exact disclosure to the reporter?"');
    expect(route).toContain('confirmLabel="Create reporter-visible disclosure"');
    expect(route).toContain("data-v3-organizer-disclosure-release-review");
  });

  it("shows the exact frozen release manifest before legacy reporter-visible creation", () => {
    expect(route).toContain("Case:");
    expect(route).toContain("Reporter-visible title:");
    expect(route).toContain("Reporter-visible content:");
    expect(route).toContain("Reporter-visible description:");
    expect(route).toContain("Reporter-visible URL:");
    expect(route).toContain("Document:");
    expect(route).toContain("Release mode:");
    expect(route).toContain("Internal disclosure reason:");
    expect(route).toContain("releaseReview.source.id");
    expect(route).toContain("releaseReview.reason");
  });

  it("remounts the composer when case or source changes so draft fields cannot cross evidence", () => {
    expect(route).toContain('key={`${detail.case.id}:${source.id}`}');
    expect(route).toContain("caseItem={detail.case}");
  });

  it("re-reads the exact case and source before creating any derivative", () => {
    const mutationStart = route.indexOf("const createMutation = useMutation");
    const reRead = route.indexOf('rpc<CaseDetail | null>("admin_integrity_case"', mutationStart);
    const caseGuard = route.indexOf(
      "disclosureCaseFingerprint(currentDetail.case) !== input.caseFingerprint",
      reRead,
    );
    const sourceGuard = route.indexOf(
      "disclosureSourceFingerprint(currentSource) !== input.sourceFingerprint",
      reRead,
    );
    const deletedGuard = route.indexOf('currentSource.lifecycle_status === "deleted"', reRead);
    const fileApply = route.indexOf("return uploadOrganizerEvidenceDerivative(", reRead);
    const nonFileApply = route.indexOf("return createOrganizerEvidenceDisclosureCopy(", reRead);

    expect(mutationStart).toBeGreaterThan(-1);
    expect(reRead).toBeGreaterThan(mutationStart);
    expect(caseGuard).toBeGreaterThan(reRead);
    expect(deletedGuard).toBeGreaterThan(reRead);
    expect(sourceGuard).toBeGreaterThan(reRead);
    expect(fileApply).toBeGreaterThan(sourceGuard);
    expect(nonFileApply).toBeGreaterThan(sourceGuard);
    expect(route).toContain(
      "The case or source evidence changed while this derivative was being prepared. Refresh and review the disclosure again.",
    );
  });

  it("applies reporter-visible creation only from the frozen review object", () => {
    expect(route).toContain("await createMutation.mutateAsync(releaseReview)");
    expect(route).toContain("input.source.id");
    expect(route).toContain("input.title");
    expect(route).toContain("input.description");
    expect(route).toContain("input.reason");
    expect(route).toContain("input.redactedText");
    expect(route).toContain("confirmDisabled={!releaseReview || !releaseReview.reporterVisible}");
  });

  it("does not force private internal redactions through a disclosure confirmation", () => {
    expect(route).toContain('reporterVisible ? "Review disclosure" : "Create internal derivative"');
    expect(route).toContain("else createMutation.mutate(input)");
  });

  it("refreshes authoritative disclosure state after success and rejected or uncertain failure", () => {
    expect(route.match(/await onChanged\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route.match(/setReleaseReview\(null\);/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("does not pretend legacy derivative RPCs already support governed partial approval", () => {
    expect(api).toContain('"admin_create_integrity_evidence_disclosure_copy"');
    expect(api).toContain('"admin_finalize_integrity_evidence_derivative"');
    expect(route).toContain("missing V3 partial-approval workflow tracked in System #944");
    expect(api).not.toContain("approveEvidenceDisclosureSubset");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-disclosure",
    );
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });
});
