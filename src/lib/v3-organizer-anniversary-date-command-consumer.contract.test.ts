import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/anniversary-dates.tsx",
  "utf8",
);
const adapter = readFileSync(
  "src/lib/v3-organizer-anniversary-date.ts",
  "utf8",
);

describe("V3 Organizer Anniversary date command consumer", () => {
  it("loads the exact server-owned review snapshot instead of re-deriving canonical state", () => {
    expect(route).toContain("loadAnniversaryDateSnapshot(edition.id)");
    expect(route).toContain("sameAnniversaryDateSnapshot(fresh, review.snapshot)");
    expect(adapter).toContain('client.rpc("studio2_anniversary_date_snapshot"');
    expect(route).not.toContain('.from("editions")');
  });

  it("commits only through the canonical R2 command with stable operation identity", () => {
    expect(adapter).toContain('command: "edition.anniversary_date.update"');
    expect(adapter).toContain('riskClass: "R2"');
    expect(adapter).toContain('client.rpc("studio2_set_anniversary_date", args)');
    expect(adapter).toContain("p_operation_id: request.operation.operationId");
    expect(adapter).toContain("p_idempotency_key: request.operation.idempotencyKey");
    expect(route).toContain("operation: review.operation");
    expect(route).not.toContain('.update({');
  });

  it("reconciles a lost response before surfacing uncertainty and never mints a retry identity", () => {
    expect(adapter).toContain('"studio2_reconcile_operation"');
    expect(adapter).toContain("p_operation_id: request.operation.operationId");
    expect(route).toContain("stableOperationIdentity: Boolean(review.operation.operationId)");
    expect(route).toContain("if (recovery.keepOperationOpen)");
    expect(route).toContain("setPendingReview(review)");
    expect(route).toContain('confirmLabel={pendingReview?.attempted ? "Retry same operation"');
  });

  it("binds the operator review to reason, exact scope and receipt evidence", () => {
    expect(route).toContain("Reason");
    expect(route).toContain("pendingReview.reason.trim().length < 5");
    expect(route).toContain("R2 · exact edition");
    expect(route).toContain("Operation {pendingReview.operation.operationId}");
    expect(route).toContain("result.operationId");
    expect(route).toContain('content: "noindex, nofollow"');
  });
});
