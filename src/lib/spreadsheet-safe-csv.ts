const SPREADSHEET_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

/**
 * Spreadsheet applications may interpret cells beginning with =, +, -, or @
 * as formulas even when the value came from an ordinary CSV file. Prefix
 * untrusted formula-like cells with an apostrophe so exported feedback remains
 * inert data when an organizer opens it in spreadsheet software.
 */
export function neutralizeSpreadsheetFormula(value: string): string {
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function escapeSpreadsheetCsvCell(value: unknown): string {
  const text = neutralizeSpreadsheetFormula(String(value ?? ""));
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToSpreadsheetSafeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeSpreadsheetCsvCell).join(",")).join("\r\n");
}
