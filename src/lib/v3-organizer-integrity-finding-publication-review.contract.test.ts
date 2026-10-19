import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/integrity-case.$caseId.tsx");
const review = source("src/components/admin/IntegrityFindingPublicationReview.tsx");

describe("V3 Organizer Integrity finding and precedent review", () => {
  it("routes both consequential actions through explicit review sheets", () => {
    expect(route).toContain("<IntegrityFindingReview");
    expect(route).toContain("<IntegrityPrecedentPublicationReview");
    expect(route).toContain("Review finding");
    expect(route).toContain("Review publication");
    expect(review).toContain('confirmationText={caseCode}');
    expect(review).toContain("official finding");
    expect(review).toContain("public decisions surface");
  });

  it("captures immutable command values rather than applying mutable form state", () => {
    expect(route).toContain("basisFingerprint: integrityDecisionBasisFingerprint(detail)");
    expect(route).toContain("_outcome: activeReview.outcome");
    expect(route).toContain("_summary: activeReview.summary");
    expect(route).toContain("_rationale: activeReview.rationale");
    expect(route).toContain("_rule_ids: activeReview.ruleIds");
    expect(route).toContain("_visible_to_reporter: activeReview.visibleToReporter");
    expect(route).toContain("_title: activeReview.title");
  });

  it("re-fetches the exact case immediately before apply and fails closed on stale review basis", () => {
    expect(route.match(/rpc<CaseDetail \| null>\("admin_integrity_case"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(route).toContain("integrityDecisionBasisFingerprint(live) !== activeReview.basisFingerprint");
    expect(route).toContain("Integrity case changed while this finding review was open");
    expect(route).toContain("Nothing was recorded");
    expect(route).toContain("Integrity case changed while this publication review was open");
    expect(route).toContain("Nothing was published");
    expect(route).toContain("ruleLinks:");
    expect(route).toContain("findings:");
    expect(route).toContain("evidence:");
    expect(route).toContain("messages:");
    expect(route).toContain("requests:");
  });

  it("keeps the legacy RPCs as the only mutation authority for this slice", () => {
    expect(route.match(/admin_record_integrity_finding/g)?.length).toBe(1);
    expect(route.match(/admin_publish_integrity_decision/g)?.length).toBe(1);
    expect(route).not.toContain("window.confirm(");
    expect(route).not.toContain("window.prompt(");
  });

  it("states the remaining System authority gap instead of claiming parity", () => {
    expect(review).toContain("System #1102");
    expect(review).toContain("canonical expected-version/CAS");
    expect(review).toContain("stable idempotency");
    expect(review).toContain("operation receipts");
    expect(review).toContain("uncertain-outcome recovery");
  });
});
