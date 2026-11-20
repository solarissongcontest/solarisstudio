import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/integrity-evidence.tsx", "utf8");

describe("Organizer Integrity Evidence Tier 4 verified-read safety", () => {
  it("keeps sensitive deletion data and irreversible reviews in the authenticated workspace", () => {
    expect(source).toContain("useAuthenticatedUser().id");
    expect(source).toContain("component: IntegrityEvidenceLifecycleScope,");
    expect(source).toContain("<IntegrityEvidenceLifecycle key={actorId} actorId={actorId} />");
    expect(source).toContain('queryKey: ["admin-integrity-evidence-due", actorId]');
    expect(source).toContain('queryKey: ["admin-integrity-evidence-expired-uploads", actorId]');
    expect((source.match(/enabled: Boolean\(actorId\)/g) ?? []).length).toBe(2);
    expect((source.match(/gcTime: 0,/g) ?? []).length).toBe(2);
  });

  it("never presents a false clear or Tier 4 mutation if private reads are unverified", () => {
    expect(source).toContain("const recordsVerified = Boolean(actorId) &&");
    expect(source).toContain("dueQuery.isSuccess && expiredQuery.isSuccess");
    expect(source).toContain("!dueQuery.isFetching && !expiredQuery.isFetching");
    expect(source).toContain("const due = recordsVerified ? (dueQuery.data ?? []) : [];");
    expect(source).toContain("const expired = recordsVerified ? (expiredQuery.data ?? []) : [];");
    expect(source).toContain("{recordsVerified ? (");
    expect(source.indexOf("{recordsVerified ? (")).toBeLessThan(source.indexOf('Metric label="Due deletions"'));
    expect(source).toContain("Evidence lifecycle could not be verified.");
    expect(source).toContain("Retry evidence verification");
  });

  it("preserves storage-first server deletion and typed human confirmation", () => {
    expect(source).toContain("mutationFn: () => deleteDueEvidence(item)");
    expect(source).toContain("mutationFn: () => cleanExpiredEvidenceUpload(item)");
    expect(source).toContain("confirmationText={item.case_code}");
    expect(source).toContain("confirmationText={item.original_name}");
  });
});
