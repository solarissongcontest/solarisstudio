import { describe, expect, it } from "vitest";
import { isCurrentAnniversaryCommand } from "./anniversary-command-scope";

describe("Anniversary asynchronous command completion", () => {
  it("allows completion only in the original Organizer selection", () => {
    const command = { editionId: "edition-a", contextVersion: 1 };
    expect(isCurrentAnniversaryCommand(command, { ...command })).toBe(true);
    expect(isCurrentAnniversaryCommand(command, { editionId: "edition-b", contextVersion: 2 })).toBe(false);
    // Returning to A must not let an earlier request clear the new A review.
    expect(isCurrentAnniversaryCommand(command, { editionId: "edition-a", contextVersion: 3 })).toBe(false);
  });

  it("rejects missing edition and invalid selection generations", () => {
    for (const contextVersion of [NaN, Infinity, -1, 0.5]) {
      const scope = { editionId: "edition-a", contextVersion };
      expect(isCurrentAnniversaryCommand(scope, scope)).toBe(false);
    }
    expect(isCurrentAnniversaryCommand({ editionId: "", contextVersion: 0 }, { editionId: "", contextVersion: 0 })).toBe(false);
  });
});
