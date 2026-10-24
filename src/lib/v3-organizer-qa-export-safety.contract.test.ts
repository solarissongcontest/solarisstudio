import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = read("src/components/admin/AdminQaCoveragePage.tsx");
const registry = read("src/lib/v3-organizer-capability-registry.ts");

describe("Organizer QA evidence export safety", () => {
  it("uses the shared spreadsheet-safe serializer for tester-controlled exports", () => {
    expect(page).toContain('import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv"');
    expect(page).toContain("rowsToSpreadsheetSafeCsv([headers, ...rows])");
    expect(page).not.toContain("function escapeCsv(");
  });

  it("reads only the QA submission fields consumed by the page", () => {
    expect(page).toContain(
      '.select("id,tester_name,device,browser,familiarity,answers,bug_reports,screenshot_paths,form_version,created_at")',
    );
    expect(page).not.toContain('from("admin_beta_test_submissions" as never)\n        .select("*")');
  });

  it("does not mistake safety hardening for deterministic exact-SHA certification", () => {
    expect(registry).toContain('"workspace-beta-coverage": "restrict"');
    expect(registry).toContain('id === "workspace-beta-coverage"');
  });
});
