import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/anniversary-dates.tsx"),
  "utf8",
);

describe("Organizer Anniversary date governed cutover", () => {
  it("uses the governed snapshot and operation RPCs rather than browser table mutation", () => {
    expect(route).toContain('"studio2_anniversary_date_snapshot"');
    expect(route).toContain('"studio2_set_anniversary_date"');
    expect(route).not.toContain('.from("editions").update(');
    expect(route).not.toContain('.from("editions")\n        .update(');
  });

  it("freezes one operation identity at review creation for safe retry reconciliation", () => {
    expect(route).toContain("const operationId = crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: `anniversary-date:${operationId}`");
    expect(route).toContain("p_operation_id: pendingReview.operationId");
    expect(route).toContain("p_idempotency_key: pendingReview.idempotencyKey");
    expect(route).toContain("p_correlation_id: pendingReview.operationId");
    expect(route).toContain("operationStarted: true");
  });

  it("preserves the explicit before/after review and requires an audit reason", () => {
    expect(route).toContain("baselineDate: currentDate");
    expect(route).toContain("baselineYear: edition.year ?? null");
    expect(route).toContain("nextDate: nextDate || null");
    expect(route).toContain("Reason for historical change");
    expect(route).toContain("if (reason.length < 5)");
    expect(route).toContain("p_reason: reason");
  });

  it("fails closed on stale server state and keeps non-conflict retries on the same review", () => {
    expect(route).toContain('operationError.code === "40001"');
    expect(route).toContain('operationError.message?.includes("VERSION_CONFLICT")');
    expect(route).toContain("You can retry this same reviewed operation safely.");
    expect(route).toContain('await qc.invalidateQueries({ queryKey: ["editions"] })');
  });
});
