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
    expect(route).toContain('.select("id, edition_number, name, event_date, year")');
    expect(route).toContain('(live.event_date ?? null) !== pendingReview.baselineDate');
    expect(route).toContain('(live.year ?? null) !== pendingReview.baselineYear');
    expect(route).toContain("changed while this review was open. Nothing was changed");
    expect(route).toContain('await qc.invalidateQueries({ queryKey: ["editions"] })');
  });

  it("guards the legacy write against a race after the live read", () => {
    expect(route).toContain('update.eq("event_date", pendingReview.baselineDate)');
    expect(route).toContain('update.is("event_date", null)');
    expect(route).toContain('update.eq("year", pendingReview.baselineYear)');
    expect(route).toContain('update.is("year", null)');
    expect(route).toContain('update.select("id").maybeSingle()');
    expect(route).toContain("changed immediately before apply, so the reviewed date was not written");
  });

  it("states the remaining System authority gap instead of claiming parity", () => {
    expect(route).toContain("System #633 still owns the canonical versioned, idempotent");
    expect(route).toContain("durable operation receipt");
    expect(route).toContain("legacy table write");
    expect(route).toContain("does not claim that parity");
  });
});