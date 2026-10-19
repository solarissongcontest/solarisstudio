import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-disclosure.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-evidence.ts", "utf8");

describe("V3 Organizer evidence disclosure release preview", () => {
  it("routes reporter-visible derivatives through an explicit release preview", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("reporterVisible ? setReleasePreviewOpen(true) : createMutation.mutate()");
    expect(route).toContain('title="Release this exact disclosure to the reporter?"');
    expect(route).toContain('confirmLabel="Create reporter-visible disclosure"');
  });

  it("shows the exact release manifest before legacy reporter-visible creation", () => {
    expect(route).toContain("Reporter-visible title:");
    expect(route).toContain("Reporter-visible content:");
    expect(route).toContain("Reporter-visible description:");
    expect(route).toContain("Reporter-visible URL:");
    expect(route).toContain("Document:");
    expect(route).toContain("Release mode:");
    expect(route).toContain("Internal disclosure reason:");
    expect(route).toContain("source.id");
  });

  it("does not force private internal redactions through a disclosure confirmation", () => {
    expect(route).toContain('reporterVisible ? "Review disclosure" : "Create internal derivative"');
    expect(route).toContain("confirmDisabled={!reporterVisible || !valid}");
  });

  it("does not pretend the legacy derivative RPCs already support governed partial approval", () => {
    expect(api).toContain('"admin_create_integrity_evidence_disclosure_copy"');
    expect(api).toContain('"admin_finalize_integrity_evidence_derivative"');
    expect(route).toContain("missing V3 partial-approval workflow tracked in System #944");
    expect(api).not.toContain("approveEvidenceDisclosureSubset");
  });
});
