import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const review = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");

describe("V3 Organizer Entry Review scope", () => {
  it("removes all-editions mode from the operational queue", () => {
    expect(review).toContain('data-v3-organizer-entry-review=""');
    expect(review).toContain('<option value="">Select edition…</option>');
    expect(review).not.toContain('<option value="all">All editions</option>');
    expect(review).toContain('editionRows.find((edition) => edition.id === organizerEditionId)?.id ?? ""');
  });

  it("computes review state from the selected edition only", () => {
    expect(review).toContain("const scopedRows = useMemo");
    expect(review).toContain("rows.filter((row) => row.editions?.id === editionId)");
    expect(review).toContain('const reviewCount = scopedRows.filter');
    expect(review).toContain('const issueCount = scopedRows.filter');
    expect(review).toContain('const readyCount = scopedRows.filter');
  });

  it("requests Next in Line for the exact edition rather than the legacy all-editions scope", () => {
    expect(review).toContain('admin_confirmation_next_in_line');
    expect(review).toContain('_edition_id: editionId');
    expect(review).not.toContain('_edition_id: null');
  });

  it("blocks child review routes when Organizer edition context is missing", () => {
    expect(review).toContain('if (pathname.startsWith(`${Route.fullPath}/`))');
    expect(review).toContain('if (!editionId)');
    expect(review).toContain('Entry Review is edition-scoped operational work');
  });
});
