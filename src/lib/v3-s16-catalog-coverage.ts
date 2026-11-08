/**
 * Fail closed when the disposable S16 catalog did not return one exact row for
 * every critical table. A missing relation must not disappear through flatMap
 * and leave a seemingly complete catalog-evidence artifact behind.
 *
 * This validates collection completeness, not canonical writer authority.
 * The S16 catalog and execution audits still make the release decision.
 */
export function requireV3S16CatalogTableCoverage<T extends { table: string }>(
  expectedTables: readonly string[],
  rows: readonly (T | null)[],
): T[] {
  if (expectedTables.length === 0 || new Set(expectedTables).size !== expectedTables.length) {
    throw new Error("S16 catalog requires a nonempty, unique critical-table inventory");
  }
  if (rows.length !== expectedTables.length) {
    throw new Error(
      "S16 catalog returned " + rows.length + " table rows for " + expectedTables.length + " required tables",
    );
  }

  const complete: T[] = [];
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (let i = 0; i < expectedTables.length; i += 1) {
    const expected = expectedTables[i];
    const row = rows[i];
    if (row == null) {
      missing.push(expected);
    } else if (
      typeof row !== "object" ||
      Array.isArray(row) ||
      typeof row.table !== "string" ||
      row.table !== expected
    ) {
      mismatched.push(expected);
    } else {
      complete.push(row);
    }
  }

  if (missing.length || mismatched.length) {
    throw new Error(
      "S16 catalog critical-table coverage incomplete" +
        (missing.length ? "; missing: " + missing.join(", ") : "") +
        (mismatched.length ? "; mismatched identity: " + mismatched.join(", ") : ""),
    );
  }
  return complete;
}
