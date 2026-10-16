import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entryScreen = readFileSync("src/components/v3/V3EntryScreen.tsx", "utf8");
const editRoute = readFileSync("src/routes/confirmations/edit/$token.tsx", "utf8");
const confirmationForm = readFileSync("src/components/ConfirmationForm.tsx", "utf8");

describe("V3 Entry correction focus contract", () => {
  it("derives focus from canonical lifecycle evidence only after server authorization", () => {
    expect(entryScreen).toContain("deriveV3EntryLifecycle(projection.confirmation)");
    expect(entryScreen).toContain("inferV3EntryCorrectionSection(lifecycle.issue)");
    expect(entryScreen).toContain("openEntryEditor({ data: {} })");
    expect(entryScreen).toContain("appendV3EntryEditorFocus(result.href, correctionSection)");
    expect(entryScreen).not.toMatch(/openEntryEditor\(\{\s*data:\s*\{[^}]+(section|country|edition|submission|user)/s);
  });

  it("treats the URL fragment as presentation-only and never as edit authorization", () => {
    expect(editRoute).toContain("parseV3EntryEditorFocus(hash)");
    expect(editRoute).toContain("initialStep={entryFocus?.step ?? undefined}");
    expect(editRoute).toContain("data-v3-entry-correction-blocked");
    expect(confirmationForm).toContain("initialStep?: number");
    expect(confirmationForm).toContain("Presentation-only starting point");
    expect(confirmationForm).not.toMatch(/edit_token:\s*initialStep/);
    expect(confirmationForm).not.toMatch(/round_id:\s*initialStep/);
  });

  it("keeps the existing Confirmation writer and submit boundary", () => {
    expect(editRoute).toContain("ConfirmationFormWithReceipt");
    expect(confirmationForm).toContain("useServerFn(submitConfirmation)");
    expect(confirmationForm).toContain("...(editToken ? { edit_token: editToken } : {})");
  });
});
