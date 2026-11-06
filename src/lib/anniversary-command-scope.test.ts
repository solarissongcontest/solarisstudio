import { describe, expect, it } from "vitest";
import { isCurrentAnniversaryCommand } from "./anniversary-command-scope";

describe("Anniversary asynchronous command completion", () => {
  it("allows completion only in the original Organizer selection", () => {
    const command = { actorId: "actor-a", editionId: "edition-a", contextVersion: 1 };
    expect(isCurrentAnniversaryCommand(command, { ...command })).toBe(true);
    expect(isCurrentAnniversaryCommand(command, { actorId: "actor-a", editionId: "edition-b", contextVersion: 2 })).toBe(false);
    // Returning to A must not let an earlier request clear the new A review.
    expect(isCurrentAnniversaryCommand(command, { actorId: "actor-a", editionId: "edition-a", contextVersion: 3 })).toBe(false);
  });

  it("does not install another account's delayed completion", () => {
    const command = { actorId: "actor-a", editionId: "edition-a", contextVersion: 1 };
    expect(isCurrentAnniversaryCommand(command, { ...command, actorId: "actor-b" })).toBe(false);
  });

  it("rejects missing edition and invalid selection generations", () => {
    for (const contextVersion of [NaN, Infinity, -1, 0.5]) {
      const scope = { actorId: "actor-a", editionId: "edition-a", contextVersion };
      expect(isCurrentAnniversaryCommand(scope, scope)).toBe(false);
    }
    expect(isCurrentAnniversaryCommand({ actorId: "actor-a", editionId: "", contextVersion: 0 }, { actorId: "actor-a", editionId: "", contextVersion: 0 })).toBe(false);
  });
});
