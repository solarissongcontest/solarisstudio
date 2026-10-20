import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = () =>
  readFileSync(resolve(process.cwd(), "src/components/NextInLineCompetition.tsx"), "utf8");

describe("V3 Next in Line participant state", () => {
  it("renders existing canonical submissions instead of presenting a stale blank task", () => {
    const source = component();

    expect(source).toContain("result.existing_submission ?? null");
    expect(source).toContain("Submission received");
    expect(source).toContain("Revision {existingSubmission.revision}");
    expect(source).toContain("existingSubmission && !editingExisting");
  });

  it("only exposes editing while the canonical competition state is open", () => {
    const source = component();

    expect(source).toContain('competitionState === "open"');
    expect(source).toContain('competitionState !== "open"');
    expect(source).toContain("There is no actionable submission to complete right now.");
    expect(source).toContain("The submission window is no longer open for changes.");
  });

  it("distinguishes authentication, authorization and stale-state failures", () => {
    const source = component();

    expect(source).toContain('error === "authentication"');
    expect(source).toContain('error === "forbidden"');
    expect(source).toContain('result.error === "state_changed"');
    expect(source).toContain("Reload the current state before trying again.");
  });

  it("does not let an existing completed submission silently become a new blank form", () => {
    const source = component();

    expect(source).toContain("setExistingSubmission(existing)");
    expect(source).toContain("setSelectedNfEntry(existing.nationalFinalEntryId ?? \"\")");
    expect(source).toContain("setArtist(existing.artist ?? \"\")");
    expect(source).toContain("setSongTitle(existing.songTitle ?? \"\")");
    expect(source).toContain("setSongUrl(existing.songUrl ?? \"\")");
    expect(source).toContain("setPreviewStart(existing.previewStart ?? \"\")");
  });
});
