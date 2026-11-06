import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/records/index.tsx"),
  "utf8",
);

describe("Public Records browser presentation consolidation", () => {
  it("preserves distinct installed-app and browser navigation", () => {
    expect(route).toContain("if (isAppMode)");
    expect(route).toContain("<V3RecordsGate fallback={<LegacyRecordsPage />} />");
    expect(route).toContain("return <LegacyRecordsPage />");
    expect(route).toContain('presentationMode === "mobile-web"');
  });

  it("renders the same mobile/desktop header in ready, pending and error states", () => {
    expect(route).toContain("function RecordsPageHeader({ mobileWeb, ready }");
    expect(route).toContain("data-records-mobile-web-header");
    expect(route.match(/data-records-mobile-web-header/g)?.length).toBe(1);
    expect(route).toContain("<RecordsPageHeader mobileWeb={mobileWeb} ready={false} />");
    expect(route).toContain("<RecordsPageHeader mobileWeb={mobileWeb} ready />");
    expect(route).toContain("const loading = archiveIsLoading(...archiveQueries)");
    expect(route).toContain("const failed = archiveHasError(...archiveQueries)");
    expect(route).toContain("if (loading || failed)");
    expect(route).toContain('<ArchiveDataLoading label="Calculating records from the archive…" />');
    expect(route).toContain("<ArchiveDataError />");
  });

  it("retains all archive category and citation/link presentation on mobile web", () => {
    expect(route).toContain("buildCanonicalFanRecords({");
    expect(route).toContain("data-records-mobile-web-coverage");
    expect(route).toContain("data-records-mobile-web-categories");
    expect(route).toContain("Tied countries share the record.");
    expect(route).toContain('to="/archive-games"');
    expect(route).toContain("RecordHolderRow");
    expect(route).not.toContain("setInterval(");
  });
});
