import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-preclearance.tsx"),
  "utf8",
);

describe("V3 Organizer private rule ruling review", () => {
  it("freezes the exact reviewed ruling payload and case fingerprint", () => {
    expect(route).toContain("type PendingRulingReview = {");
    expect(route).toContain("baselineFingerprint: string;");
    expect(route).toContain("summary: summary.trim()");
    expect(route).toContain("rationale: rationale.trim()");
    expect(route).toContain("ruleIds: [...ruleIds]");
    expect(route).toContain(
      "baselineFingerprint: preclearanceRulingReviewFingerprint(detail)",
    );
    expect(route).toContain("open={Boolean(pendingReview)}");
    expect(route).toContain("pendingReview.summary");
    expect(route).toContain("pendingReview.rationale");
    expect(route).toContain("pendingReview.ruleIds.map");
  });

  it("fingerprints exact case state and rule-link basis deterministically", () => {
    expect(route).toContain("export function preclearanceRulingReviewFingerprint");
    expect(route).toContain("caseKind: detail.case.case_kind");
    expect(route).toContain("details: detail.case.details");
    expect(route).toContain("status: detail.case.status");
    expect(route).toContain("priority: detail.case.priority");
    expect(route).toContain("ruleLinks: detail.rule_links");
    expect(route).toContain("ruleId: link.rule_id");
    expect(route).toContain("relevance: link.relevance");
    expect(route).toContain("note: link.note");
    expect(route).toContain(".sort((left, right) =>");
  });

  it("re-reads the exact Integrity case before the legacy ruling authority", () => {
    const reread = route.indexOf(
      'const liveDetail = await rpc<CaseDetail | null>("admin_integrity_case"',
    );
    const staleCheck = route.indexOf(
      "preclearanceRulingReviewFingerprint(liveDetail) !==",
    );
    const legacyWrite = route.indexOf(
      "return recordAdminPreclearanceRuling(review.caseId",
    );

    expect(reread).toBeGreaterThan(-1);
    expect(staleCheck).toBeGreaterThan(reread);
    expect(legacyWrite).toBeGreaterThan(staleCheck);
    expect(route).toContain('liveDetail.case.case_kind !== "rule_question"');
    expect(route).toContain(
      "This private rule question changed while the ruling review was open. Nothing was recorded.",
    );
  });

  it("revalidates the frozen rule IDs and never substitutes refreshed form state", () => {
    expect(route).toContain(
      "const missingRules = review.ruleIds.filter((ruleId) => !getRuleById(ruleId))",
    );
    expect(route).toContain("outcome: review.outcome");
    expect(route).toContain("summary: review.summary");
    expect(route).toContain("rationale: review.rationale");
    expect(route).toContain("ruleIds: review.ruleIds");
    expect(route).not.toContain(
      "recordAdminPreclearanceRuling(detail.case.id, { outcome, summary, rationale, ruleIds })",
    );
  });

  it("keeps canonical System command authority visibly unresolved", () => {
    expect(route).toContain("System #950");
    expect(route).toContain(
      "rulebook-snapshot binding, expected-version/CAS, idempotency and receipt authority",
    );

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-rule-rulings",
    );
    expect(capability?.migrationStatus).toBe("building");
  });
});
