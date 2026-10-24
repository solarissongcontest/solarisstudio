import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_SLO_SCOPES } from "./v3-error-budget";
import { V3_S10_REQUIRED_CRITICAL_ALERTS } from "./v3-s10-slo-evidence";

describe("System V3 S10 evidence contract", () => {
  it("keeps S10 evidence bound to the canonical scope and critical-alert inventories", () => {
    expect(V3_SLO_SCOPES).toContain("jury_submission");
    expect(V3_SLO_SCOPES).toContain("televote_submission");
    expect(V3_SLO_SCOPES).toContain("publication");
    expect(V3_S10_REQUIRED_CRITICAL_ALERTS).toEqual([
      "critical_submission_error_rate_spike",
      "result_publication_mismatch",
      "database_unavailable",
      "auth_failure_spike",
      "production_egress_anomaly",
      "notification_queue_deadline_drain_failure",
    ]);
  });

  it("cannot turn component evidence into final release certification", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/v3-s10-slo-evidence.ts"),
      "utf8",
    );
    expect(source).toContain('phase: "S10"');
    expect(source).toContain("productionTrafficGenerated: false");
    expect(source).toContain("certificationClaim: false");
    expect(source).toContain("qaReviewRequired: true");
    expect(source).toContain('status === "ready_for_qa_review"');
  });
});
