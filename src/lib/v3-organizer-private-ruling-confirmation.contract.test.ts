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

  it("keeps canonical governed ruling authority in System rather than inventing it in browser code", () => {
    expect(api).toContain('"admin_record_integrity_preclearance_ruling"');
    expect(route).toContain("System #950");
    expect(api).not.toContain("p_operation_id");
    expect(api).not.toContain("p_idempotency_key");
    expect(api).not.toContain("p_expected_version");
  });
});