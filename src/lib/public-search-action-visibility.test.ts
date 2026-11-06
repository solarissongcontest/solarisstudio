import { describe, expect, it } from "vitest";

import type { AccountAccess } from "./country-account";
import { canSuggestDelegationSearchActions } from "./public-search-action-visibility";

const active: AccountAccess = {
  userId: "viewer-1",
  countryId: "country-1",
  countryStatus: "active",
  schemaReady: true,
  isOrganizer: false,
  suspensionReason: null,
};

describe("Public Search personal shortcut visibility", () => {
  it("advertises delegation actions only for resolved active accounts", () => {
    expect(canSuggestDelegationSearchActions(active)).toBe(true);
  });

  it("does not advertise personal Confirmation shortcuts to anonymous or fan viewers", () => {
    expect(canSuggestDelegationSearchActions(null)).toBe(false);
    expect(canSuggestDelegationSearchActions(undefined)).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, userId: null })).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, countryId: null })).toBe(false);
  });

  it("fails closed for suspended, unresolved and malformed access", () => {
    expect(canSuggestDelegationSearchActions({ ...active, countryStatus: "suspended" })).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, countryStatus: null })).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, schemaReady: false })).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, userId: "   " })).toBe(false);
    expect(canSuggestDelegationSearchActions({ ...active, countryId: "   " })).toBe(false);
  });
});
