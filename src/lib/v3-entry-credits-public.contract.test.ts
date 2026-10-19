import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { entryCreditsValidationMessage } from "../components/EntryCreditsEditor";
import { emptyPayload } from "./ssc";
import { prefillFromSubmission } from "./prefill";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("P13 Public Entry Credits integration", () => {
  it("keeps structured Credits inside the existing canonical Confirmation payload", () => {
    const payload = emptyPayload("00000000-0000-4000-8000-000000000013");
    expect(payload.credits).toEqual([]);

    const publicFunctions = read("src/lib/public.functions.ts");
    const v3Functions = read("src/lib/v3-confirmation.functions.ts");
    for (const source of [publicFunctions, v3Functions]) {
      expect(source).toContain('role: z.enum(["composer", "lyricist", "songwriter", "producer", "arranger", "other"])');
      expect(source).toContain("credits: z.array(entryCreditSchema).max(32)");
    }
    expect(publicFunctions).toContain('rpc<ConfirmationSubmitResult>("v3_submit_confirmation"');
    expect(v3Functions).toContain('rpc<WireConfirmationResult>("v3_submit_confirmation"');
    expect(publicFunctions).not.toContain("v3_submit_entry_credits");
    expect(v3Functions).not.toContain("v3_submit_entry_credits");
  });

  it("prefills current internal and National Final Credits from the canonical Entry rows", () => {
    const base = emptyPayload("00000000-0000-4000-8000-000000000013");
    const internal = prefillFromSubmission({
      round_id: base.round_id,
      selection_method: "internal",
      internal_entries: {
        artist: "Artist",
        song_title: "Song",
        song_url: "https://example.com/song",
        credits: [
          { role: "composer", name: " Alice Example " },
          { role: "not-real", name: "Rejected" },
        ],
      },
    }, base);
    expect(internal.credits).toEqual([{ role: "composer", name: "Alice Example" }]);

    const nationalFinal = prefillFromSubmission({
      round_id: base.round_id,
      selection_method: "national_final",
      national_finals: {
        winning_entry_id: "winner",
        national_final_entries: [
          {
            id: "winner",
            position: 1,
            artist: "Winner",
            song_title: "Winning Song",
            song_url: "https://example.com/winner",
            credits: [{ role: "lyricist", name: "Writer" }],
          },
        ],
      },
    }, base);
    expect(nationalFinal.credits).toEqual([{ role: "lyricist", name: "Writer" }]);
    expect(nationalFinal.nf_entries[0]?.credits).toEqual([{ role: "lyricist", name: "Writer" }]);
  });

  it("mirrors canonical whitespace and duplicate validation before submit", () => {
    expect(entryCreditsValidationMessage([
      { role: "composer", name: "Alice   Example" },
      { role: "composer", name: " Alice Example " },
    ])).toBe("Remove duplicate credit records with the same role and name.");

    expect(entryCreditsValidationMessage([
      { role: "composer", name: "Alice Example" },
      { role: "lyricist", name: "Alice Example" },
    ])).toBeNull();
  });

  it("edits Credits in the authoritative Entry step and keeps NF winner Credits synchronized", () => {
    const form = read("src/components/ConfirmationForm.tsx");
    const editor = read("src/components/EntryCreditsEditor.tsx");
    const focus = read("src/lib/v3-entry-editor-focus.ts");

    expect(form).toContain("<EntryCreditsEditor");
    expect(form).toContain('set("credits", entry.credits ?? [])');
    expect(form).toContain('set("credits", updated.credits)');
    expect(form).toContain('credits: [] }])');
    expect(form).toContain("entryCreditsValidationMessage(data.credits ?? [])");
    expect(form).toContain("entryCreditsSummary(data.credits ?? [])");
    expect(editor).toContain("ENTRY_CREDIT_LIMIT = 32");
    expect(editor).toContain("ENTRY_CREDIT_NAME_LIMIT = 160");
    expect(editor).toContain('data-entry-credits-editor="canonical-structured-credits"');
    expect(focus).toContain("credits: 3");
  });

  it("normalizes pre-Credits local drafts instead of crashing or erasing the rest of the draft", () => {
    const form = read("src/components/ConfirmationForm.tsx");
    expect(form).toContain("normalizeFormPayload");
    expect(form).toContain("normalized.credits = Array.isArray(payload.credits) ? payload.credits : []");
    expect(form).toContain("credits: Array.isArray(entry?.credits) ? entry.credits : []");
  });
});
