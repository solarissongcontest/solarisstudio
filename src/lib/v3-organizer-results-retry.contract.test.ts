import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const results = readFileSync("src/routes/_authenticated/admin/results.tsx", "utf8");

describe("V3 Organizer Results uncertain-outcome recovery", () => {
  it("creates one immutable execution identity when the operation is opened", () => {
    expect(results).toContain("executionId: crypto.randomUUID()");
    expect(results).toContain("executionId: operation.executionId");
  });

  it("keeps the same pending operation open when recovery says the outcome is uncertain", () => {
    expect(results).toContain("stableOperationIdentity: Boolean(pending?.executionId)");
    expect(results).toContain("if (!next.keepOperationOpen)");
    expect(results).toContain("setPending(null)");
    expect(results).not.toContain("executionId: crypto.randomUUID(),\n        expectedVersion");
  });

  it("refreshes canonical Results state when recovery requires reconciliation", () => {
    expect(results).toContain("if (next.shouldRefreshCanonical)");
    expect(results).toContain("['studio2-results-operations', resolvedEditionId]");
  });

  it("guards the command against edition context changes before execution", () => {
    expect(results).toContain("validateEditionCommandScope");
    expect(results).toContain("Edition context changed before the result operation");
    expect(results).toContain("commandEditionId: operation.editionId");
  });

  it("remounts pending Tier 3/4 result work when the Organizer edition changes", () => {
    expect(results).toContain("component: ResultsOperationsRoute");
    expect(results).toContain("function ResultsOperationsRoute()");
    expect(results).toContain("<ResultsOperationsPage key={editionId || 'unscoped'} />");
  });

  it("repeats edition and show context inside the confirmation sheet", () => {
    expect(results).toContain("{edition?.name ?? pending.editionId} · {pending.row.showName}");
  });
});
