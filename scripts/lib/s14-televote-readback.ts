export function assertS14TelevoteReadback(
  expected: readonly { country_id: string; points: number }[],
  actual: readonly { country_id: string | null; points: number }[],
): number {
  const identity = (rows: readonly { country_id: string | null; points: number }[]) =>
    rows.map((row) => `${row.country_id}:${Number(row.points)}`).sort();
  if (JSON.stringify(identity(actual)) !== JSON.stringify(identity(expected))) {
    throw new Error("canonical publication readback differs from converted totals");
  }
  return actual.length;
}
