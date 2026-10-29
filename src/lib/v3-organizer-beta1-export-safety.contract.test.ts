import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = read("src/routes/_authenticated/admin/beta1-feedback.tsx");
const helper = read("src/lib/spreadsheet-safe-csv.ts");
const registry = read("src/lib/v3-organizer-capability-registry.ts");

describe("Organizer Beta 1 archive export safety", () => {
  it("reads only the historical response fields the archive actually renders or exports", () => {
    expect(route).toContain(
      '"id,tester_name,device,browser,familiarity,answers,bug_reports,form_version,created_at"',
    );
    expect(route).toContain('.select(BETA1_COLUMNS, { count: "exact" })');
    expect(route).not.toContain('.select("*")');
  });

  it("routes spreadsheet exports through the shared formula-neutralizing serializer", () => {
    expect(route).toContain('import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv"');
    expect(route).toContain("rowsToSpreadsheetSafeCsv([headers, ...rows])");
    expect(route).not.toContain("function escapeCsv(");

    expect(helper).toContain("SPREADSHEET_FORMULA_PREFIX");
    expect(helper).toContain("neutralizeSpreadsheetFormula");
    expect(helper).toContain("rowsToSpreadsheetSafeCsv");
  });

  it("keeps the historical capability visible without overclaiming V3 parity", () => {
    expect(registry).toContain('"workspace-beta-1-archive": "contextualize"');
    expect(registry).toContain('id === "workspace-beta-1-archive"');
  });
});
