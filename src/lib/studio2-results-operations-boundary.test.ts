import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseStudio2ResultOperationRow,
  validateStudio2ResultExecution,
  type Studio2ResultExecution,
  type Studio2ResultOperationRow,
} from "./studio2-results-operations";

function row(overrides: Partial<Studio2ResultOperationRow> = {}): Studio2ResultOperationRow {
  return {
    showId: "show-1",
    showName: "Grand Final",
    showKind: "grand-final",
    sortOrder: 1,
    lifecycle: "calculation_ready",
    calculationVersion: 0,
    lastCalculatedAt: null,
    lastCalculatedBy: null,
    reviewedVersion: null,
    reviewedAt: null,
    reviewedBy: null,
    lockedVersion: null,
    lockedAt: null,
    lockedBy: null,
    revealReadyVersion: null,
    revealReadyAt: null,
    revealReadyBy: null,
    preconditions: {
      participantCount: 10,
      juryEnabled: true,
      juryRequiredPoints: 10,
      juryVoterCount: 10,
      juryVoteRows: 100,
      juryDnvCount: 0,
      juryIncompleteCount: 0,
      juryConflictCount: 0,
      juryReady: true,
      televoteEnabled: true,
      televoteVoteRows: 100,
      televoteReady: true,
      calculationReady: true,
      resultRowCount: 0,
      entityCountMismatch: 0,
      sourceReconcileIssueCount: 0,
      reconcileIssueCount: 0,
      resultReady: false,
      publishedResults: false,
    },
    ...overrides,
  };
}

function execution(overrides: Partial<Studio2ResultExecution> = {}): Studio2ResultExecution {
  return {
    executionId: "execution-1",
    showId: "show-1",
    editionId: "edition-22",
    action: "lock",
    reason: "Lock reviewed result",
    calculationVersion: 4,
    previousVersion: 4,
    materializedRows: 0,
    updatedRows: 1,
    preconditionsBefore: row().preconditions,
    preconditionsAfter: row().preconditions,
    idempotentReplay: false,
    ...overrides,
  };
}

describe("Results operations transport boundary", () => {
  it("rejects negative or fractional authoritative count/version evidence", () => {
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      calculationVersion: -1,
    })).toThrow("Invalid calculationVersion");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      calculationVersion: 1.5,
    })).toThrow("Invalid calculationVersion");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      preconditions: { ...row().preconditions, juryVoteRows: -1 },
    })).toThrow("Invalid juryVoteRows");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      preconditions: { ...row().preconditions, participantCount: 4.2 },
    })).toThrow("Invalid participantCount");
  });

  it("rejects malformed nullable lifecycle evidence instead of silently erasing it", () => {
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      reviewedVersion: "not-a-version",
    })).toThrow("Invalid reviewedVersion");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      lockedVersion: -1,
    })).toThrow("Invalid lockedVersion");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      revealReadyVersion: 2.4,
    })).toThrow("Invalid revealReadyVersion");
    expect(() => parseStudio2ResultOperationRow({
      ...row(),
      reviewedAt: "eventually",
    })).toThrow("Invalid reviewedAt");
  });

  it("trims semantic string identity but rejects blank show identity", () => {
    expect(parseStudio2ResultOperationRow({
      ...row(),
      showId: " show-1 ",
      showName: " Grand Final ",
    })).toMatchObject({ showId: "show-1", showName: "Grand Final" });

    expect(() => parseStudio2ResultOperationRow({ ...row(), showId: "   " })).toThrow(
      "Invalid showId",
    );
  });

  it("binds operation receipts to the exact expected previous version", () => {
    expect(validateStudio2ResultExecution(execution(), {
      executionId: "execution-1",
      showId: "show-1",
      action: "lock",
      expectedVersion: 4,
    })).toMatchObject({ previousVersion: 4, calculationVersion: 4 });

    expect(() => validateStudio2ResultExecution(execution({ previousVersion: 3 }), {
      executionId: "execution-1",
      showId: "show-1",
      action: "lock",
      expectedVersion: 4,
    })).toThrow("previousVersion");
  });

  it("rejects regressive calculation version evidence in a success receipt", () => {
    expect(() => validateStudio2ResultExecution(execution({
      previousVersion: 4,
      calculationVersion: 3,
    }), {
      executionId: "execution-1",
      showId: "show-1",
      action: "lock",
      expectedVersion: 4,
    })).toThrow("calculationVersion");
  });

  it("keeps snapshot loading fail-closed for malformed and duplicate rows", () => {
    const source = readFileSync("src/lib/studio2-results-operations.ts", "utf8");
    expect(source).toContain("Results operations requires an explicit edition scope.");
    expect(source).toContain("Invalid results operations snapshot: expected an array.");
    expect(source).toContain("new Set(showIds).size !== showIds.length");
    expect(source).toContain("Results operations snapshot returned duplicate show rows.");
    expect(source).not.toContain("if (!Array.isArray(data)) return []");
  });
});
