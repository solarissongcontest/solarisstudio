import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("confirmation review visibility", () => {
  it("restores the original Confirmations typography", () => {
    const css = source("confirmations.css");
    expect(css).toContain('font-family: "Gotham"');
    expect(css).toContain('font-family: "Classica Crastao"');
  });

  it("shows review state on the confirmation edit page", () => {
    const editPage = source("routes/confirmations/edit/$token.tsx");
    expect(editPage).toContain("ConfirmationReviewStatus");
    expect(editPage).toContain("internalEntry={result.submission.internal_entries}");
    expect(editPage).toContain("entries: nf.national_final_entries ?? []");
  });

  it("shows the same review state in My Solaris", () => {
    const mySolaris = source("routes/_authenticated/my-solaris/index.tsx");
    expect(mySolaris).toContain("ConfirmationReviewStatus");
    expect(mySolaris).toContain("internalEntry={currentConfirmation.internal_entry}");
    expect(mySolaris).toContain("nationalFinal={currentConfirmation.national_final}");
  });

  it("keeps the secure country-account RPC source in the repository", () => {
    const sql = source("../scripts/confirmations-review-status-visibility.sql");
    expect(sql).toContain("public_country_account_confirmation_access");
    expect(sql).toContain("'review_status'");
    expect(sql).toContain("'review_reason'");
    expect(sql).toContain("public.solaris_request_country()");
  });
});
