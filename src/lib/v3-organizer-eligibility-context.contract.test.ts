import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const eligibility = readFileSync(
  "src/routes/_authenticated/admin/eligibility.tsx",
  "utf8",
);

describe("V3 Organizer Eligibility context isolation", () => {
  it("remounts pending override state when the Organizer edition changes", () => {
    expect(eligibility).toContain("key={resolvedEditionId || 'unscoped'}");
    expect(eligibility).toContain("<EligibilityDetailSheet");
    expect(eligibility).toContain("const [pendingChange, setPendingChange]");
  });

  it("repeats the authoritative preview edition in the R2 confirmation impact", () => {
    expect(eligibility).toContain(
      '<EligibilityImpactMetric label="Edition" value={preview.editionId} />',
    );
  });

  it("keeps override execution bound to the previewed edition and expected version", () => {
    expect(eligibility).toContain("editionId: pending.preview.editionId");
    expect(eligibility).toContain("expectedVersion: pending.preview.expectedVersion");
    expect(eligibility).toContain("operationId: pending.operationId");
    expect(eligibility).toContain("idempotencyKey: pending.idempotencyKey");
  });
});
