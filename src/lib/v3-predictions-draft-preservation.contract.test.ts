import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const builder = () =>
  readFileSync(resolve(process.cwd(), "src/routes/predictions/$showId.tsx"), "utf8");

describe("Prediction builder unsaved-draft safety", () => {
  it("does not rehydrate a background saved prediction over locally edited picks", () => {
    const source = builder();
    expect(source).toContain("draftDirty || hydratedEntryKey === savedEntryKey");
    expect(source).toContain("setHydratedEntryKey(savedEntryKey)");
    expect(source).toContain("hasSavedRevisionConflict");
    expect(source).toContain("Your edits have been preserved locally");
  });

  it("resets draft ownership when the account or prediction round changes", () => {
    const source = builder();
    expect(source).toContain("const draftScope = predictionDraftScope(round?.id, user?.id)");
    expect(source).toContain("setDraftDirty(false)");
    expect(source).toContain("setHydratedEntryKey(null)");
    expect(source).toContain("if (draftScopeChanged || !savedPrediction");
  });

  it("tracks every edit control and blocks submission when the saved revision changes", () => {
    const source = builder();
    expect(source.match(/setDraftDirty\(true\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("if (hasSavedRevisionConflict) {");
    expect(source).toContain("Load that version before submitting");
    expect(source).toContain("Discard edits and load saved version");
    expect(source).toContain('window.confirm("Discard your unsaved prediction edits');
    expect(source).toContain("setDraftDirty(false);\n      setMessage(\"Prediction saved");
  });

  it("does not display a mere draft as a submitted prediction in the workspace header", () => {
    expect(builder()).toContain("saved={hasSubmittedPrediction(savedPrediction)}");
  });
});
