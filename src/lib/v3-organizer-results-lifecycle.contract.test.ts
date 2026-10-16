import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  STUDIO2_RESULT_ACTIONS,
  availableStudio2ResultActions,
  type Studio2ResultOperationRow,
} from "./studio2-results-operations";

const publication = readFileSync(
  "src/routes/_authenticated/admin/publication/$slug.tsx",
  "utf8",
);

function resultRow(
  patch: Partial<Studio2ResultOperationRow> = {},
): Studio2ResultOperationRow {
  const calculationVersion = patch.calculationVersion ?? 0;
  return {
    showId: "show-final",
    showName: "Grand Final",
    showKind: "final",
    sortOrder: 1,
    lifecycle: "validation",
    calculationVersion,
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
      participantCount: 20,
      juryEnabled: true,
      juryRequiredPoints: 58,
      juryVoterCount: 20,
      juryVoteRows: 200,
      juryDnvCount: 0,
      juryIncompleteCount: 0,
      juryConflictCount: 0,
      juryReady: true,
      televoteEnabled: true,
      televoteVoteRows: 400,
      televoteReady: true,
      calculationReady: true,
      resultRowCount: calculationVersion > 0 ? 20 : 0,
      entityCountMismatch: calculationVersion > 0 ? 0 : 20,
      sourceReconcileIssueCount: 0,
      reconcileIssueCount: calculationVersion > 0 ? 0 : 20,
      resultReady: calculationVersion > 0,
      publishedResults: false,
    },
    ...patch,
  };
}

describe("V3 Organizer Results lifecycle", () => {
  it("keeps publication out of the calculation/review/lock command surface", () => {
    expect(STUDIO2_RESULT_ACTIONS).toEqual([
      "calculate",
      "review",
      "lock",
      "unlock",
      "mark_reveal_ready",
      "clear_reveal_ready",
    ]);
    expect(STUDIO2_RESULT_ACTIONS).not.toContain("publish" as never);
  });

  it("exposes calculate, then review, then lock, then reveal readiness in separate stages", () => {
    const calculate = resultRow({
      preconditions: {
        ...resultRow().preconditions,
        entityCountMismatch: 0,
        reconcileIssueCount: 0,
        resultReady: false,
      },
    });
    expect(availableStudio2ResultActions(calculate)).toEqual(["calculate"]);

    const reviewedCandidate = resultRow({
      lifecycle: "calculated",
      calculationVersion: 1,
      preconditions: {
        ...resultRow({ calculationVersion: 1 }).preconditions,
        resultReady: true,
      },
    });
    expect(availableStudio2ResultActions(reviewedCandidate)).toEqual([
      "calculate",
      "review",
    ]);

    const lockCandidate = resultRow({
      lifecycle: "reviewed",
      calculationVersion: 1,
      reviewedVersion: 1,
      preconditions: {
        ...resultRow({ calculationVersion: 1 }).preconditions,
        resultReady: true,
      },
    });
    expect(availableStudio2ResultActions(lockCandidate)).toEqual([
      "calculate",
      "lock",
    ]);

    const revealCandidate = resultRow({
      lifecycle: "locked",
      calculationVersion: 1,
      reviewedVersion: 1,
      lockedVersion: 1,
      preconditions: {
        ...resultRow({ calculationVersion: 1 }).preconditions,
        resultReady: true,
      },
    });
    expect(availableStudio2ResultActions(revealCandidate)).toEqual([
      "unlock",
      "mark_reveal_ready",
    ]);
  });

  it("makes published results terminal in Results operations", () => {
    const published = resultRow({
      lifecycle: "published",
      calculationVersion: 2,
      reviewedVersion: 2,
      lockedVersion: 2,
      revealReadyVersion: 2,
      preconditions: {
        ...resultRow({ calculationVersion: 2 }).preconditions,
        publishedResults: true,
        resultReady: true,
      },
    });
    expect(availableStudio2ResultActions(published)).toEqual([]);
  });

  it("keeps publication as a separate governed authority with release readiness and recovery", () => {
    expect(publication).toContain("isStudio2ResultReleaseReady");
    expect(publication).toContain("previewShowPublicationChange");
    expect(publication).toContain("applyShowPublicationChange");
    expect(publication).toContain("reauthenticateShowPublicationR3");
    expect(publication).toContain("resolveSolarisV6OperationRecovery");
    expect(publication).toContain("idempotencyKey: operationId");
    expect(publication).toContain("Finish result review, lock and reveal readiness first.");
    expect(publication).not.toContain("studio2_execute_result_operation");
  });
});
