import { describe, expect, it } from "vitest";
import {
  advanceConfirmationEditScope,
  canUseConfirmationEditToken,
  type ConfirmationEditScope,
} from "./confirmation-edit-scope";

const active: ConfirmationEditScope = {
  actorId: "user-a",
  countryId: "country-a",
  editionId: "edition-21",
  roundId: "round-21",
  authorized: true,
  generation: 1,
};

describe("participant Confirmation edit-token context fence", () => {
  it("permits a confirmed server token only for the still-current, authorized context", () => {
    expect(canUseConfirmationEditToken(active, { ...active })).toBe(true);
    expect(advanceConfirmationEditScope(active, { ...active })).toEqual(active);
  });

  it("rejects account, delegation, edition and round switches", () => {
    for (const different of [
      { actorId: "user-b" },
      { countryId: "country-b" },
      { editionId: "edition-22" },
      { roundId: "round-22" },
      { authorized: false },
    ]) {
      const changed = advanceConfirmationEditScope(active, { ...active, ...different });
      expect(changed.generation).toBe(2);
      expect(canUseConfirmationEditToken(active, changed)).toBe(false);
    }
  });

  it("rejects missing identity or authorization instead of navigating", () => {
    for (const invalid of [
      { actorId: null },
      { countryId: null },
      { editionId: null },
      { roundId: null },
      { authorized: false },
    ]) {
      const missing = { ...active, ...invalid };
      expect(canUseConfirmationEditToken(missing, missing)).toBe(false);
    }
  });

  it("rejects a stale result after an A-B-A switch or component unmount", () => {
    const switched = advanceConfirmationEditScope(active, { ...active, countryId: "country-b" });
    const back = advanceConfirmationEditScope(switched, { ...active });
    expect(back.generation).toBe(3);
    expect(canUseConfirmationEditToken(active, back)).toBe(false);
    expect(canUseConfirmationEditToken(active, { ...active, generation: 2 })).toBe(false);
  });
});
