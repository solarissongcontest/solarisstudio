import { describe, expect, it } from "vitest";

import {
  appendV3EntryEditorFocus,
  parseV3EntryEditorFocus,
  v3EntryEditorFocusHash,
} from "./v3-entry-editor-focus";

describe("V3 Entry correction focus", () => {
  it("maps canonical sections onto the existing authoritative writer without inventing selectors", () => {
    expect(parseV3EntryEditorFocus("#entry-section-song")).toEqual({
      section: "song",
      step: 3,
      supported: true,
    });
    expect(parseV3EntryEditorFocus("#entry-section-artist")?.step).toBe(3);
    expect(parseV3EntryEditorFocus("#entry-section-media")?.step).toBe(3);
    expect(parseV3EntryEditorFocus("#entry-section-metadata")?.step).toBe(4);
    expect(parseV3EntryEditorFocus("#entry-section-review")?.step).toBe(5);
  });

  it("keeps Credits explicitly blocked until the canonical writer can persist it", () => {
    expect(parseV3EntryEditorFocus("#entry-section-credits")).toEqual({
      section: "credits",
      step: null,
      supported: false,
    });
  });

  it("rejects unknown hashes and only appends allowlisted presentation focus", () => {
    expect(parseV3EntryEditorFocus("#entry-section-admin")).toBeNull();
    expect(parseV3EntryEditorFocus("#https://evil.invalid")).toBeNull();
    expect(v3EntryEditorFocusHash("media")).toBe("#entry-section-media");
    expect(
      appendV3EntryEditorFocus("/confirmations/edit/server-token#old", "artist"),
    ).toBe("/confirmations/edit/server-token#entry-section-artist");
    expect(appendV3EntryEditorFocus("/confirmations/edit/server-token", null)).toBe(
      "/confirmations/edit/server-token",
    );
  });
});
