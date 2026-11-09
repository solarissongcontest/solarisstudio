export type CombinedRecoveryProjection = {
  countryCode: string;
  points: number;
};

export type CombinedRecoveryAssessment = {
  canonical: "pending" | "reconciled" | "missing" | "mismatch" | "unverifiable";
  snapshot: "not_required" | "complete" | "incomplete" | "unverifiable";
};

export function assessCombinedPublicationRecovery(input: {
  published: boolean;
  sourceRows: readonly CombinedRecoveryProjection[];
  projectionRows: readonly CombinedRecoveryProjection[];
  snapshot?: {
    expectedRows: readonly CombinedRecoverySnapshotRow[];
    actualRows: readonly CombinedRecoverySnapshotRow[];
    readable?: boolean;
  };
}): CombinedRecoveryAssessment {
  if (!input.published) return { canonical: "pending", snapshot: "not_required" };
  if (!input.sourceRows.length || input.sourceRows.some(isInvalidProjection)) {
    return { canonical: "unverifiable", snapshot: assessSnapshot(input.snapshot) };
  }
  const projection = assessProjection(input.sourceRows, input.projectionRows);
  return { canonical: projection, snapshot: assessSnapshot(input.snapshot) };
}

export type CombinedRecoverySnapshotRow = {
  roundId: string;
  countryCode: string;
  sourceType: string;
  displayOrder: number;
  finalPoints: number;
  rawScore: number | null;
  activityPoints: number | null;
  weightPercent: number | null;
  countryContributions: Record<string, number>;
};

function isInvalidProjection(row: CombinedRecoveryProjection) {
  return (
    !/^[A-Z0-9_-]{2,12}$/.test(row.countryCode) ||
    !Number.isFinite(row.points) ||
    !Number.isSafeInteger(row.points)
  );
}

function assessProjection(
  expectedRows: readonly CombinedRecoveryProjection[],
  actualRows: readonly CombinedRecoveryProjection[],
): "reconciled" | "missing" | "mismatch" {
  if (!actualRows.length) return "missing";
  if (actualRows.some(isInvalidProjection)) return "mismatch";

  const expectedCodes = expectedRows.map((row) => row.countryCode);
  const actualCodes = actualRows.map((row) => row.countryCode);
  if (
    new Set(expectedCodes).size !== expectedCodes.length ||
    new Set(actualCodes).size !== actualCodes.length ||
    expectedCodes.length !== actualCodes.length
  ) {
    return "mismatch";
  }

  const expected = new Map(expectedRows.map((row) => [row.countryCode, row.points]));
  return actualRows.every((row) => expected.get(row.countryCode) === row.points)
    ? "reconciled"
    : "mismatch";
}

function assessSnapshot(
  snapshot:
    | {
        expectedRows: readonly CombinedRecoverySnapshotRow[];
        actualRows: readonly CombinedRecoverySnapshotRow[];
        readable?: boolean;
      }
    | undefined,
): CombinedRecoveryAssessment["snapshot"] {
  if (!snapshot) return "not_required";
  if (snapshot.readable === false) return "unverifiable";
  if (snapshot.expectedRows.length !== snapshot.actualRows.length) return "incomplete";

  const identity = (row: CombinedRecoverySnapshotRow) =>
    `${row.roundId}:${row.countryCode}`;
  const expectedIds = snapshot.expectedRows.map(identity);
  const actualIds = snapshot.actualRows.map(identity);
  if (
    new Set(expectedIds).size !== expectedIds.length ||
    new Set(actualIds).size !== actualIds.length
  ) {
    return "incomplete";
  }

  const expected = new Map(expectedIds.map((id, index) => [id, snapshot.expectedRows[index]]));
  return snapshot.actualRows.every((actual) => {
    const wanted = expected.get(identity(actual));
    if (!wanted) return false;
    return (
      wanted.sourceType === actual.sourceType &&
      wanted.displayOrder === actual.displayOrder &&
      wanted.finalPoints === actual.finalPoints &&
      wanted.rawScore === actual.rawScore &&
      wanted.activityPoints === actual.activityPoints &&
      wanted.weightPercent === actual.weightPercent &&
      sameContributionMap(wanted.countryContributions, actual.countryContributions)
    );
  })
    ? "complete"
    : "incomplete";
}

function sameContributionMap(
  expected: Record<string, number>,
  actual: Record<string, number>,
) {
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const actualEntries = Object.entries(actual).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    expectedEntries.length === actualEntries.length &&
    expectedEntries.every(
      ([key, value], index) =>
        actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value,
    )
  );
}
