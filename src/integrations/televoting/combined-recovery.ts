export type CombinedRecoveryProjection = {
  countryCode: string;
  points: number;
};

export type CombinedRecoveryAssessment = {
  canonical: "pending" | "reconciled" | "missing" | "mismatch";
  snapshot: "not_required" | "complete" | "incomplete";
};

export function assessCombinedPublicationRecovery(input: {
  published: boolean;
  sourceRows: readonly CombinedRecoveryProjection[];
  projectionRows: readonly CombinedRecoveryProjection[];
  snapshot?: { rowCount: number; expectedRowCount: number };
}): CombinedRecoveryAssessment {
  if (!input.published) return { canonical: "pending", snapshot: "not_required" };
  const snapshot = input.snapshot
    ? input.snapshot.rowCount >= input.snapshot.expectedRowCount
      ? "complete"
      : "incomplete"
    : "not_required";
  if (!input.projectionRows.length) return { canonical: "missing", snapshot };

  const expected = new Map(input.sourceRows.map((row) => [row.countryCode, row.points]));
  const actual = new Map(input.projectionRows.map((row) => [row.countryCode, row.points]));
  const reconciled =
    expected.size === actual.size &&
    [...expected].every(([countryCode, points]) => actual.get(countryCode) === points);
  return { canonical: reconciled ? "reconciled" : "mismatch", snapshot };
}
