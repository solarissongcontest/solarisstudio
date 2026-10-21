import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-appeals.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260911160200_integrity_appeal_extensions.sql",
  "utf8",
);

describe("V3 Organizer exceptional appeal extension review", () => {
  it("does not apply an exceptional extension directly from the edit form", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("onClick={openExtensionReview}");
    expect(route).toContain("open={Boolean(pendingReview)}");
    expect(route).not.toContain("onClick={() => mutation.mutate()}");
    expect(route).toContain("Review extension");
  });

  it("compares the exact deadline change and reason before apply", () => {
    expect(route).toContain("Original deadline:");
    expect(route).toContain("Proposed deadline:");
    expect(route).toContain("Exceptional reason:");
    expect(route).toContain("rejected-late to submitted");
    expect(route).toContain("reporter-visible case audit trail");
  });

  it("preserves the existing server-side eligibility and deadline invariants", () => {
    expect(migration).toContain("Only an appeal rejected as late can receive an exceptional deadline extension");
    expect(migration).toContain("Extended deadline must be later than the original appeal deadline");
    expect(migration).toContain("Extended deadline must cover the already-submitted appeal");
    expect(migration).toContain("Exceptional appeal extensions cannot exceed 14 days without a rulebook change");
    expect(migration).toContain("appeal.extension_granted");
  });

  it("does not claim the legacy extension RPC is already the canonical V3 command", () => {
    expect(route).toContain("Canonical V3 preflight, version/CAS, idempotency and receipt authority remain");
    expect(route).toContain("tracked in System #947");
    expect(migration).not.toContain("studio2_claim_operation");
    expect(migration).not.toContain("p_idempotency_key");
  });
});