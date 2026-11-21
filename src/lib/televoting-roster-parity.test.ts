import { describe, expect, it } from "vitest";
import { linkedTelevoteRosterMatches } from "./televoting-roster-parity";

describe("official Televoting participation roster", () => {
  it("allows a matching active country roster regardless of sort order", () => {
    expect(linkedTelevoteRosterMatches(["ELA", "SKA", "NOR"], ["nor", "ela", "ska"])).toBe(true);
  });

  it("rejects a removed/disqualified country that remains in a stale round", () => {
    expect(linkedTelevoteRosterMatches(["NOR", "AOT"], ["NOR", "AOT", "SKA"])).toBe(false);
  });

  it("rejects an incomplete round after a country is restored", () => {
    expect(linkedTelevoteRosterMatches(["NOR", "AOT", "SKA"], ["NOR", "AOT"])).toBe(false);
  });

  it("fails closed for duplicates and empty active rosters", () => {
    expect(linkedTelevoteRosterMatches(["A", "B"], ["A", "A"])).toBe(false);
    expect(linkedTelevoteRosterMatches([], [])).toBe(false);
    expect(linkedTelevoteRosterMatches(["NOR", ""], ["NOR", ""])).toBe(false);
  });
});
