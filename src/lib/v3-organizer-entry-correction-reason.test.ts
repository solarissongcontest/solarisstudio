import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOrganizerEntryCorrectionReason,
  ORGANIZER_ENTRY_CORRECTION_CATEGORIES,
} from "./v3-organizer-entry-correction-reason";

describe("Organizer Entry request-for-changes reason", () => {
  it("exposes exactly the ten canonical issue categories", () => {
    expect(ORGANIZER_ENTRY_CORRECTION_CATEGORIES.map((item) => item.id)).toEqual([
      "song_file", "duration", "title", "artist", "image",
      "video", "credits", "metadata", "eligibility", "other",
    ]);
  });

  it("formats a clear and deterministic participant-facing explanation", () => {
    expect(buildOrganizerEntryCorrectionReason([
      { category: "credits", explanation: "  Please list every composer. " },
      { category: "duration", explanation: "Shorten the song to the permitted limit." },
    ], "Confirm both corrections in the next submission.")).toBe(
      "Changes requested for this Entry:\n" +
      "- Credits: Please list every composer.\n" +
      "- Duration: Shorten the song to the permitted limit.\n\n" +
      "Additional context:\nConfirm both corrections in the next submission.",
    );
  });

  it("rejects empty issues and missing category-specific explanations", () => {
    expect(buildOrganizerEntryCorrectionReason([])).toBeNull();
    expect(buildOrganizerEntryCorrectionReason([{ category: "artist", explanation: " " }])).toBeNull();
  });

  it("rejects duplicate category keys instead of fabricating extra issues", () => {
    expect(buildOrganizerEntryCorrectionReason([
      { category: "artist", explanation: "One" },
      { category: "artist", explanation: "Two" },
    ])).toBeNull();
  });

  it("rejects unrecognized issue categories even if supplied at runtime", () => {
    expect(buildOrganizerEntryCorrectionReason([
      { category: "spoofed" as "artist", explanation: "Invalid" },
    ])).toBeNull();
  });

  it("normalizes newline injection inside individual issue descriptions", () => {
    expect(buildOrganizerEntryCorrectionReason([
      { category: "metadata", explanation: "Check   dates\n and sources" },
    ])).toBe("Changes requested for this Entry:\n- Metadata: Check dates and sources");
  });

  it("preserves multilined additional context without silently rewriting it", () => {
    const reason = buildOrganizerEntryCorrectionReason([
      { category: "other", explanation: "Update details" },
    ], "First line\nSecond line");
    expect(reason).toContain("Additional context:\nFirst line\nSecond line");
  });

  it("binds the same formatted reason to command intent and canonical RPC", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("buildOrganizerEntryCorrectionReason(selectedCorrectionIssues, correctionMessage)");
    expect(route).toContain('nextStatus === "declined" ? correctionReason : reason.trim()');
    expect(route).toContain("reason: effectiveReason || null,");
    expect(route).toContain("p_reason: effectiveReason || \"\",");
    expect(route).toContain('nextStatus === "declined"');
    expect(route).toContain("Request changes");
    expect(route).toContain("entry.request_changes");
  });

  it("keeps structured correction authority server-owned and acknowledges compatibility limits", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("The backend currently records one reviewed reason");
    expect(route).toContain("studio2_apply_confirmation_entry_review");
    expect(route).not.toContain("new_entry_correction_rpc");
  });
});
