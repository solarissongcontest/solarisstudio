import { describe, expect, it } from "vitest";

import {
  assertOwnedHistoryCountry,
  resolveOwnedHistoryScope,
  scopedOwnedHistoryQueryKey,
} from "./owned-history-scope";

const account = (viewerId: string, countryId: string) => ({
  access: { userId: viewerId, countryId },
  country: { id: countryId },
});

describe("private delegation history scope", () => {
  it("does not authorize history until verified viewer and country ownership agree", () => {
    expect(resolveOwnedHistoryScope(null, account("viewer-a", "country-a"))).toBeNull();
    expect(resolveOwnedHistoryScope("viewer-b", account("viewer-a", "country-a"))).toBeNull();
    expect(resolveOwnedHistoryScope("viewer-a", {
      access: { userId: "viewer-a", countryId: "country-b" },
      country: { id: "country-a" },
    })).toBeNull();
    expect(resolveOwnedHistoryScope("viewer-a", null)).toBeNull();
    expect(resolveOwnedHistoryScope("viewer-a", account("viewer-a", "country-a"), "viewer-b")).toBeNull();
  });

  it("namespaces both historical reads per viewer and country, including a country transfer", () => {
    const first = resolveOwnedHistoryScope("viewer-a", account("viewer-a", "country-a"));
    const secondViewer = resolveOwnedHistoryScope("viewer-b", account("viewer-b", "country-a"));
    const secondCountry = resolveOwnedHistoryScope("viewer-a", account("viewer-a", "country-b"));
    expect(first).toEqual({ viewerId: "viewer-a", countryId: "country-a" });
    for (const prefix of ["owned-hod-edition-history", "owned-country-identity-history"] as const) {
      expect(scopedOwnedHistoryQueryKey(prefix, first))
        .not.toEqual(scopedOwnedHistoryQueryKey(prefix, secondViewer));
      expect(scopedOwnedHistoryQueryKey(prefix, first))
        .not.toEqual(scopedOwnedHistoryQueryKey(prefix, secondCountry));
    }
    expect(scopedOwnedHistoryQueryKey("owned-hod-edition-history", null))
      .toEqual(["owned-hod-edition-history", null, null]);
  });

  it("rejects cross-country and unscoped responses instead of displaying stale history", () => {
    const scope = { viewerId: "viewer-a", countryId: "country-a" };
    expect(() => assertOwnedHistoryCountry({ country_id: "country-a", editions: [] }, scope)).not.toThrow();
    expect(() => assertOwnedHistoryCountry({ country_id: "country-b", editions: [] }, scope)).toThrow(/verified/);
    expect(() => assertOwnedHistoryCountry({ editions: [] }, scope)).toThrow(/verified/);
    expect(() => assertOwnedHistoryCountry(null, scope)).toThrow(/verified/);
  });
});
