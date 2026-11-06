import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/integrity-preclearance.tsx",
  "utf8",
);

describe("Organizer private Rule Rulings account isolation", () => {
  it("remounts the complete selection and review workspace on actor changes", () => {
    expect(source).toContain('import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext"');
    expect(source).toContain("component: IntegrityPreclearanceIdentityBoundary");
    expect(source).toContain("const { id: actorId } = useAuthenticatedUser()");
    expect(source).toContain("<IntegrityPreclearanceWorkspace key={actorId} actorId={actorId} />");
    expect(source).toContain("function IntegrityPreclearanceWorkspace({ actorId }: { actorId: string })");
  });

  it("uses actor and exact case identity for every confidential React Query cache", () => {
    expect(source).toContain('queryKey: ["admin-integrity-cases", "preclearance", actorId]');
    expect(source).toContain('queryKey: ["admin-integrity-case", "preclearance", actorId, caseId]');
    expect(source).toContain('queryKey: ["admin-integrity-preclearance-rulings", actorId, caseId]');
    expect(source).toContain('enabled: Boolean(actorId)');
    expect(source.match(/enabled: Boolean\(actorId && caseId\)/g)).toHaveLength(2);
    expect(source.match(/refetchOnMount: "always"/g)).toHaveLength(3);
  });

  it("does not display stale cached private case data or allow review during refetch", () => {
    expect(source).toContain("const casesVerified = casesQuery.isSuccess && !casesQuery.isFetching");
    expect(source).toContain("const detailVerified = detailQuery.isSuccess && !detailQuery.isFetching");
    expect(source).toContain("const rulingsVerified = rulingsQuery.isSuccess && !rulingsQuery.isFetching");
    expect(source).toContain("resolvePrivateRuleQuestionSelection(casesQuery.data, selectedCase, casesVerified)");
    expect(source).toContain("disabled={!casesVerified}");
    expect(source).toContain("casesQuery.isPending || casesQuery.isFetching");
    expect(source).toContain("detailQuery.isPending || detailQuery.isFetching || rulingsQuery.isPending || rulingsQuery.isFetching");
    expect(source).toContain("detailVerified && rulingsVerified && detailQuery.data?.case.id === caseId");
  });

  it("preserves authoritative case-drift checks before participant-visible rulings", () => {
    expect(source).toContain("preclearanceRulingReviewFingerprint(liveDetail)");
    expect(source).toContain("review.baselineFingerprint");
    expect(source).toContain("recordAdminPreclearanceRuling(review.caseId");
  });
});
