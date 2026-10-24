import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/components/admin/AdminQaCoveragePage.tsx", "utf8");
const route = readFileSync(
  "src/routes/_authenticated/admin/admin-beta-feedback.tsx",
  "utf8",
);

const dashboardFields = [
  "id",
  "tester_name",
  "device",
  "browser",
  "familiarity",
  "answers",
  "bug_reports",
  "form_version",
  "created_at",
] as const;

describe("V3 Organizer QA Coverage egress and export boundary", () => {
  it("selects only the response fields the coverage workspace consumes", () => {
    const match = component.match(
      /\.from\("admin_beta_test_submissions" as never\)\s*\.select\("([^"]+)"\)/,
    );

    expect(match?.[1]?.split(",")).toEqual(dashboardFields);
    expect(component).not.toContain('.select("*")');
    expect(match?.[1]).not.toContain("user_agent");
    expect(match?.[1]).not.toContain("screenshot_paths");
  });

  it("preserves the complete response population required by coverage math", () => {
    expect(component).toContain('.order("created_at", { ascending: false })');
    expect(component).not.toContain(".limit(");
    expect(component).not.toContain(".range(");
    expect(component).toContain("buildAdminQaCoverageMatrix({");
    expect(component).toContain("submissions,");
    expect(component).toContain("latestQaCoverageSubmissions(submissions)");
  });

  it("creates screenshot URLs only after deliberate user interaction", () => {
    expect(component).toContain("const loadScreenshot = useCallback");
    expect(component).toContain('.createSignedUrl(path, 60 * 60)');
    expect(component).toContain("Load screenshot");
    expect(component).not.toContain("const paths = Array.from(");
    expect(component).not.toContain("paths.map(async (path)");
  });

  it("uses the shared spreadsheet-safe CSV serializer from the parent security slice", () => {
    expect(component).toContain('import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv";');
    expect(component).toContain("rowsToSpreadsheetSafeCsv([headers, ...rows])");
    expect(component).not.toContain("function escapeCsv(");
  });

  it("remains a private, read-only Organizer workspace", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(component).not.toContain(".insert(");
    expect(component).not.toContain(".update(");
    expect(component).not.toContain(".delete(");
  });
});
