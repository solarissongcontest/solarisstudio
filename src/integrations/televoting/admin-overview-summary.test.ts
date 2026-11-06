import { describe, expect, it } from "vitest";
import { parseTelevotingOverviewSummary } from "./admin-overview-summary";

const valid = {
  editions: 4,
  rounds: 2,
  openRounds: 1,
  submissions: 30,
  blocked: 2,
  activeEdition: "SSC 22",
  remoteEditionId: "remote-22",
  linked: true,
};

describe("Organizer voting overview canonical readback", () => {
  it("preserves a valid linked round/ballot projection", () => {
    expect(parseTelevotingOverviewSummary(valid)).toEqual(valid);
  });

  it("accepts a genuine unlinked edition as empty, without fabricating a link", () => {
    expect(parseTelevotingOverviewSummary({
      ...valid, rounds: 0, openRounds: 0, submissions: 0, blocked: 0,
      remoteEditionId: null, linked: false,
    }).linked).toBe(false);
  });

  it.each([null, undefined, {}, [], "", 0])("rejects absent or malformed readback %s", (input) => {
    expect(() => parseTelevotingOverviewSummary(input)).toThrow();
  });

  it.each([
    { editions: -1 },
    { rounds: 1.5 },
    { openRounds: 3 },
    { submissions: "0" },
    { blocked: null },
    { editions: Number.POSITIVE_INFINITY },
  ])("rejects invalid counts instead of turning them into reassuring zeros: %o", (patch) => {
    expect(() => parseTelevotingOverviewSummary({ ...valid, ...patch })).toThrow();
  });

  it.each([
    { linked: null },
    { linked: false },
    { remoteEditionId: null },
    { activeEdition: "" },
    { remoteEditionId: " " },
  ])("rejects inconsistent status identities: %o", (patch) => {
    expect(() => parseTelevotingOverviewSummary({ ...valid, ...patch })).toThrow();
  });
});
