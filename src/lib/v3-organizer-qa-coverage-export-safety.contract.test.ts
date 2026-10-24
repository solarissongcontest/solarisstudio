import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const coverage = source("components/admin/AdminQaCoveragePage.tsx");
const csv = source("lib/spreadsheet-safe-csv.ts");
const registry = source("lib/v3-organizer-capability-registry.ts");

describe("Organizer V3 QA Coverage least-data and export safety", () => {
  it("reads only the QA evidence fields the dashboard consumes", () => {
    expect(coverage).toContain(
      '"id,tester_name,device,browser,familiarity,answers,bug_reports,screenshot_paths,form_version,created_at"',
    );
    expect(coverage).toContain(".select(ADMIN_BETA_SUBMISSION_FIELDS)");
    expect(coverage).not.toContain('.select("*")');
    expect(coverage).not.toContain("user_agent:");
  });

  it("preserves bounded screenshot signing for evidence attachments", () => {
    expect(coverage).toContain('.from("beta-feedback")');
    expect(coverage).toContain(".createSignedUrl(path, 60 * 60)");
    expect(coverage).toContain("screenshot_paths");
    expect(coverage).toContain("bug.screenshotPath");
  });

  it("routes tester-controlled CSV cells through the shared spreadsheet-safe serializer", () => {
    expect(coverage).toContain(
      'import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv";',
    );
    expect(coverage).toContain("rowsToSpreadsheetSafeCsv([headers, ...rows])");
    expect(coverage).not.toContain("function escapeCsv");

    expect(csv).toContain("SPREADSHEET_FORMULA_PREFIX");
    expect(csv).toContain("neutralizeSpreadsheetFormula");
    expect(csv).toContain('join("\\r\\n")');
  });

  it("does not promote manual QA coverage to parity or certification", () => {
    expect(registry).toContain('"workspace-beta-coverage": "restrict"');
    expect(registry).toContain('id === "workspace-beta-coverage"');
    expect(registry).not.toContain('id === "workspace-beta-coverage") return "parity"');
  });
});