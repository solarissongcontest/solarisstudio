import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-preclearance.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-preclearance.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260911161700_integrity_preclearance_rulings.sql",
  "utf8",
);

describe("V3 Organizer private rule ruling review", () => {
  it("does not record a participant-visible ruling directly from the editor", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("onClick={openRulingReview}");
    expect(route).toContain("open={Boolean(pendingReview)}");
    expect(route).toContain("Review ruling");
    expect(route).not.toContain('onClick={() => mutation.mutate()} className="admin-action-primary">\n            <Gavel');
  });

  it("shows the exact ruling content and current-rule basis before apply", () => {
    expect(route).toContain("Participant-visible summary:");
    expect(route).toContain("Rationale and assumptions:");
    expect(route).toContain("Current rules cited:");
    expect(route).toContain("getRuleById(id)?.title");
    expect(route).toContain('confirmLabel="Record participant-visible ruling"');
  });

  it("makes the needs-more-information consequence explicit", () => {
    expect(route).toContain('outcome === "needs_more_information"');
    expect(route).toContain("moves the case to waiting_for_reporter");
    expect(migration).toContain("then 'waiting_for_reporter'");
    expect(migration).toContain("visible_to_reporter");
  });

  it("submits the reviewed ruling via the governed versioned and idempotent database command", () => {
    expect(api).toContain('"studio2_integrity_record_preclearance_ruling"');
    expect(api).not.toContain('"admin_record_integrity_preclearance_ruling"');
    expect(api).toContain("p_operation_id: operationId");
    expect(api).toContain("p_idempotency_key: operationId");
    expect(api).toContain("p_expected_version: expectedVersion");
    expect(route).toContain("preclearanceRulingReviewFingerprint(liveDetail)");
    expect(route).toContain("liveDetail.case.version");
    expect(route).toContain("System #950");
  });
});