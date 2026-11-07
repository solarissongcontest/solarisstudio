import { describe, expect, it } from "vitest";

import {
  canExposeOrganizerCountryCockpitRows,
  resolveOrganizerCountryCockpitPrivateScope,
} from "./v3-organizer-country-cockpit-private-query";

const verified = {
  actorId: "actor-a",
  editionId: "edition-22",
  editionVerified: true,
};

describe("private Organizer Country Cockpit scope", () => {
  it("keys private readiness by exact account AND edition, not edition alone", () => {
    const first = resolveOrganizerCountryCockpitPrivateScope(verified);
    const switchedAccount = resolveOrganizerCountryCockpitPrivateScope({
      ...verified,
      actorId: "actor-b",
    });
    const switchedEdition = resolveOrganizerCountryCockpitPrivateScope({
      ...verified,
      editionId: "edition-23",
    });

    expect(first.enabled).toBe(true);
    expect(first.queryKey).toContain("actor-a");
    expect(first.queryKey).toContain("edition-22");
    expect(switchedAccount.queryKey).not.toEqual(first.queryKey);
    expect(switchedEdition.queryKey).not.toEqual(first.queryKey);
  });

  it("disables private fetches when account or edition cannot be verified", () => {
    for (const scope of [
      { ...verified, actorId: null },
      { ...verified, actorId: "  " },
      { ...verified, editionId: null },
      { ...verified, editionId: "" },
      { ...verified, editionVerified: false },
    ]) {
      expect(resolveOrganizerCountryCockpitPrivateScope(scope).enabled).toBe(false);
      expect(
        canExposeOrganizerCountryCockpitRows(scope, {
          isSuccess: true,
          isFetching: false,
          error: null,
        }),
      ).toBe(false);
    }
  });

  it("does not expose stale rows during refetch, failure, or pending verification", () => {
    expect(
      canExposeOrganizerCountryCockpitRows(verified, {
        isSuccess: true,
        isFetching: false,
        error: null,
      }),
    ).toBe(true);

    for (const state of [
      { isSuccess: true, isFetching: true, error: null },
      { isSuccess: false, isFetching: false, error: null },
      { isSuccess: false, isFetching: false, error: new Error("permission revoked") },
      { isSuccess: true, isFetching: false, error: new Error("stale permission") },
    ]) {
      expect(canExposeOrganizerCountryCockpitRows(verified, state)).toBe(false);
    }
  });

  it("normalizes whitespace without creating a shared anonymous private cache", () => {
    const scope = resolveOrganizerCountryCockpitPrivateScope({
      actorId: " actor-a ",
      editionId: " edition-22 ",
      editionVerified: true,
    });
    expect(scope.queryKey).toEqual([
      "studio2-country-cockpit",
      "organizer-countries",
      "actor-a",
      "edition-22",
    ]);
    expect(
      resolveOrganizerCountryCockpitPrivateScope({
        actorId: "",
        editionId: "edition-22",
        editionVerified: true,
      }).enabled,
    ).toBe(false);
  });
});
