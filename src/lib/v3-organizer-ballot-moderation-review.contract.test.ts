import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const view = readFileSync(
  "src/components/televoting/IntegrityReviewView.tsx",
  "utf8",
);
const functions = readFileSync(
  "src/integrations/televoting/moderation.functions.ts",
  "utf8",
);

describe("V3 Organizer ballot moderation review boundaries", () => {
  it("routes status judgements through an explicit Organizer review instead of direct mutation", () => {
    expect(view).toContain("requestStatusReview(detail, \"verified\")");
    expect(view).toContain("requestStatusReview(detail, \"suspicious\")");
    expect(view).toContain("requestStatusReview(detail, \"active\")");
    expect(view).not.toContain('onClick={() => statusMutation.mutate({ id: detail.id');
    expect(view).toContain('title={pendingStatusReview ? `${submissionLabel(pendingStatusReview.fromStatus)} → ${submissionLabel(pendingStatusReview.toStatus)}?`');
    expect(view).toContain("Decision reason");
    expect(view).toContain("confirmDisabled={!pendingStatusReview || pendingStatusReview.reason.trim().length < 5}");
  });

  it("captures exact ballot identity and prior state in the pending decision", () => {
    expect(view).toContain("roundId: submission.round_id");
    expect(view).toContain("roundName: submission.round_name");
    expect(view).toContain("fromStatus: submission.status");
    expect(view).toContain("riskScore: submission.risk_score");
    expect(view).toContain("isVpn: submission.is_vpn");
  });

  it("re-reads the exact round and fails closed when reviewed ballot state changed", () => {
    expect(view).toContain("const current = await listVotes({ data: { roundId: targetRoundId } })");
    expect(view).toContain("current.find((submission) => submission.id === id)");
    expect(view).toContain("live.status !== expectedStatus");
    expect(view).toContain("Nothing was changed. Refresh the integrity case and review the decision again.");
    expect(view).toContain("await requireLiveSubmission(value.id, value.roundId, value.fromStatus)");
  });

  it("passes the reviewed reason into the existing audited status authority", () => {
    expect(view).toContain("status: value.toStatus");
    expect(view).toContain("reason: value.reason.trim()");
    expect(functions).toContain('status: "active" | "suspicious" | "verified"; reason?: string');
  });

  it("also stale-checks exclusion and restore before their existing mutations", () => {
    expect(view).toContain("await requireLiveSubmission(value.id, value.roundId, value.expectedStatus)");
    expect(view).toContain("expectedStatus: excludeTarget.status");
    expect(view).toContain('await requireLiveSubmission(submission.id, submission.round_id, "deleted")');
    expect(view).toContain("refuses restore unless it is still excluded");
  });

  it("does not pretend the UI review solves missing canonical edition authority", () => {
    expect(view).toContain("System-owned under #686");
    expect(view).toContain("does not claim those guarantees");
  });
});
