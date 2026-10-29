import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/beta1-feedback.tsx", "utf8");

describe("V3 Organizer Beta 1 archive egress boundary", () => {
  it("loads the closed archive through explicit bounded pages", () => {
    expect(route).toContain("const BETA1_PAGE_SIZE = 50");
    expect(route).toContain("const BETA1_COLUMNS =");
    expect(route).toContain('.select(BETA1_COLUMNS, { count: "exact" })');
    expect(route).toContain('.eq("form_version", 2)');
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).toContain('.order("id", { ascending: false })');
    expect(route).toContain(".range(offset, offset + pageSize - 1)");
    expect(route).not.toContain('.select("*")');
  });

  it("preserves the upstream spreadsheet-safe export boundary while paging export reads", () => {
    expect(route).toContain('import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv"');
    expect(route).toContain("rowsToSpreadsheetSafeCsv([headers, ...rows])");
    expect(route).not.toContain("function escapeCsv(");
    expect(route).toContain("const BETA1_EXPORT_PAGE_SIZE = 250");
    expect(route).toContain("const BETA1_EXPORT_MAX_ROWS = 5_000");
    expect(route).toContain("offset < BETA1_EXPORT_MAX_ROWS");
    expect(route).toContain("fetchBeta1Page(offset, BETA1_EXPORT_PAGE_SIZE)");
    expect(route).toContain("Use a governed server export for larger archives.");
  });

  it("tells the operator when summary state is only based on loaded pages", () => {
    expect(route).toContain('label="Loaded responses"');
    expect(route).toContain('label="Ease · loaded"');
    expect(route).toContain("Summary metrics above describe the currently loaded page set");
    expect(route).toContain("hasMore");
    expect(route).toContain("loadMore");
  });

  it("remains a protected read-only historical surface", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
    expect(route).not.toContain("setInterval(");
    expect(route).not.toContain("refetchInterval");
  });
});
