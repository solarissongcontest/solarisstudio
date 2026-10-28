import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/anniversary-dates.tsx");

describe("V3 Organizer anniversary date review boundary", () => {
  it("reviews date changes instead of mutating directly from the row button", () => {
    expect(route).toContain("<AdminConfirmSheet");
    expect(route).toContain("prepareDateReview(edition)");
    expect(route).toContain('confirmLabel="Apply reviewed date"');
    expect(route).toContain("confirmationText={pendingReview?.editionLabel}");
    expect(route).not.toContain("const saveDate = async");
    expect(route).not.toContain("onClick={() => saveDate(edition)}");
  });

  it("freezes exact edition identity and before/after historical values", () => {
    expect(route).toContain("editionId: edition.id");
    expect(route).toContain("editionLabel: editionLabel(edition)");
    expect(route).toContain("editionName: edition.name");
    expect(route).toContain("editionNumber: edition.edition_number ?? null");
    expect(route).toContain("baselineDate: currentDate");
    expect(route).toContain("baselineYear: edition.year ?? null");
    expect(route).toContain("nextDate: nextDate || null");
    expect(route).toContain("nextYear");
  });

  it("re-reads exact edition state immediately before apply and fails closed on drift", () => {
    expect(route).toContain('.select("id,edition_number,name,event_date,year,data_revision")');
    expect(route).toContain('(live.event_date ?? null) !== pendingReview.baselineDate');
    expect(route).toContain('(live.year ?? null) !== pendingReview.baselineYear');
    expect(route).toContain("changed while this review was open. Nothing was changed");
    expect(route).toContain('await qc.invalidateQueries({ queryKey: ["editions"] })');
  });

  it("uses the canonical metadata command with exact reviewed scope and server CAS", () => {
    expect(route).toContain("applyEditionMetadataChange({");
    expect(route).toContain("editionId: pendingReview.editionId");
    expect(route).toContain("expectedRevision: Number(live.data_revision)");
    expect(route).toContain("event_date: pendingReview.nextDate");
    expect(route).toContain("year: pendingReview.nextYear");
    expect(route).not.toMatch(/\.from\("editions"\)\s*\.update/);
    const authority = source("src/lib/edition-authority.ts");
    expect(authority).toContain("expectedRevision");
    expect(authority).toContain("operationId");
  });

  it("reports canonical metadata ownership and the committed revision", () => {
    expect(route).toContain("same versioned canonical authority as other edition metadata");
    expect(route).toContain("receipt.edition.data_revision");
    expect(route).not.toContain("legacy table write");
  });
});
