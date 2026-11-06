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

  it("uses the governed exact reviewed revision instead of raw table DML", () => {
    expect(route).toContain("applyEditionMetadataChange({");
    expect(route).toContain("expectedRevision: pendingReview.baselineRevision");
    expect(route).toContain("Number(live.data_revision) !== pendingReview.baselineRevision");
    expect(route).not.toContain('.update({');
    expect(route).toContain("receipt.edition.data_revision");
  });

  it("keeps the larger edition writer cutover distinct from this command", () => {
    expect(route).toContain("System #633");
    expect(route).toContain("broader edition writer cutover remains incomplete");
  });
});
