import { describe, expect, it } from "vitest";

import {
  escapeSpreadsheetCsvCell,
  neutralizeSpreadsheetFormula,
  rowsToSpreadsheetSafeCsv,
} from "./spreadsheet-safe-csv";

describe("spreadsheet-safe CSV", () => {
  it("neutralizes formula-like untrusted cells, including leading spreadsheet whitespace", () => {
    for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", " =HYPERLINK(\"x\")", "\t=1+1"]) {
      expect(neutralizeSpreadsheetFormula(value)).toEqual(`'${value}`);
    }

    expect(neutralizeSpreadsheetFormula("ordinary feedback")).toEqual("ordinary feedback");
    expect(neutralizeSpreadsheetFormula("1 + 1")).toEqual("1 + 1");
  });

  it("applies CSV quoting after formula neutralization", () => {
    expect(escapeSpreadsheetCsvCell('=HYPERLINK("https://example.invalid")')).toEqual(
      "\"'=HYPERLINK(\"\"https://example.invalid\"\")\"",
    );
    expect(escapeSpreadsheetCsvCell("line one\nline two")).toEqual('"line one\nline two"');
    expect(escapeSpreadsheetCsvCell("plain")).toEqual("plain");
  });

  it("serializes rows with CRLF separators without executing formula-like cells", () => {
    expect(
      rowsToSpreadsheetSafeCsv([
        ["Tester", "Feedback"],
        ["Arthur", "=1+1"],
        ["Pau", "safe, but quoted"],
      ]),
    ).toEqual("Tester,Feedback\r\nArthur,'=1+1\r\nPau,\"safe, but quoted\"");
  });
});
