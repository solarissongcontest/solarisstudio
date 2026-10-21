import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  "src/routes/_authenticated/admin/rule-interpretations.tsx",
  "utf8",
);
const api = readFileSync("src/lib/rule-interpretations.ts", "utf8");
const publicationReview = readFileSync(
  "src/components/admin/RuleInterpretationPublicationReview.tsx",
  "utf8",
);

describe("V3 Organizer Official Interpretation review freshness", () => {
  it("prepares publication from a fresh persisted draft instead of unsaved form state", () => {
    expect(route).toContain("const publicationReviewMutation = useMutation");
    expect(route).toContain("const freshItems = await getAdminRuleInterpretations()");
    expect(route).toContain("const localSnapshot = toDraftInput(draft)");
    expect(route).toContain("const persistedSnapshot = persistedDraftInput(fresh)");
    expect(route).toContain(
      "This form contains unsaved changes. Save the draft before reviewing the exact publication snapshot.",
    );
    expect(route).toContain("setPendingPublication(review)");
    expect(route).not.toContain("setPublishReviewOpen(true)");
  });

  it("renders the publication review only from its frozen persisted snapshot", () => {
    expect(route).toContain("type PendingPublication");
    expect(route).toContain("fingerprint: interpretationFingerprint(fresh)");
    expect(route).toContain("snapshot: persistedSnapshot");
    expect(route).toContain("code={pendingPublication.item.code}");
    expect(route).toContain("title={pendingPublication.snapshot.title}");
    expect(route).toContain("question={pendingPublication.snapshot.question}");
    expect(route).toContain("interpretation={pendingPublication.snapshot.interpretation}");
    expect(route).toContain("rationale={pendingPublication.snapshot.rationale}");
    expect(route).toContain("ruleIds={pendingPublication.snapshot.ruleIds}");
    expect(publicationReview).toContain("data-v3-organizer-interpretation-publication-review");
  });

  it("re-reads and fingerprint-checks the exact draft immediately before legacy publication", () => {
    const mutationStart = route.indexOf("const publishMutation = useMutation");
    const reRead = route.indexOf("await getAdminRuleInterpretations()", mutationStart);
    const draftGuard = route.indexOf('fresh.status !== "draft"', reRead);
    const fingerprintGuard = route.indexOf(
      "interpretationFingerprint(fresh) !== review.fingerprint",
      reRead,
    );
    const ruleGuard = route.indexOf("fresh.rule_ids.some((ruleId) => !getRuleById(ruleId))", reRead);
    const apply = route.indexOf("return publishRuleInterpretation(review.item.id)", reRead);

    expect(mutationStart).toBeGreaterThan(-1);
    expect(reRead).toBeGreaterThan(mutationStart);
    expect(draftGuard).toBeGreaterThan(reRead);
    expect(fingerprintGuard).toBeGreaterThan(reRead);
    expect(ruleGuard).toBeGreaterThan(reRead);
    expect(apply).toBeGreaterThan(ruleGuard);
    expect(route).toContain(
      "This interpretation changed while publication was being reviewed. Refresh and review the exact draft again.",
    );
  });

  it("freezes both published sides of supersession and rechecks them before apply", () => {
    expect(route).toContain("currentFingerprint: interpretationFingerprint(current)");
    expect(route).toContain("replacementFingerprint: interpretationFingerprint(replacement)");

    const mutationStart = route.indexOf("const supersedeMutation = useMutation");
    const reRead = route.indexOf("await getAdminRuleInterpretations()", mutationStart);
    const currentGuard = route.indexOf(
      "interpretationFingerprint(current) !== pending.currentFingerprint",
      reRead,
    );
    const replacementGuard = route.indexOf(
      "interpretationFingerprint(replacement) !== pending.replacementFingerprint",
      reRead,
    );
    const apply = route.indexOf(
      "return supersedeRuleInterpretation(pending.currentId, pending.replacementId)",
      reRead,
    );

    expect(reRead).toBeGreaterThan(mutationStart);
    expect(currentGuard).toBeGreaterThan(reRead);
    expect(replacementGuard).toBeGreaterThan(currentGuard);
    expect(apply).toBeGreaterThan(replacementGuard);
  });

  it("refreshes authoritative state after refused or uncertain consequential mutations", () => {
    expect(route.match(/await refresh\(\);/g)?.length).toBeGreaterThanOrEqual(8);
    expect(route.match(/setPendingPublication\(null\);/g)?.length).toBeGreaterThanOrEqual(4);
    expect(route.match(/setPendingSupersession\(null\);/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps legacy RPCs below parity while System #956 owns governed authority", () => {
    expect(api).toContain('"admin_publish_rule_interpretation"');
    expect(api).toContain('"admin_supersede_rule_interpretation"');
    expect(publicationReview).toContain("System #956");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-interpretations",
    );
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });
});
