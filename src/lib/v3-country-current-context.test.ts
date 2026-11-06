import { describe, expect, it } from "vitest";

import type { CountryDiscovery } from "./v3-discovery-entities";
import { isPublishedCurrentCountryEntry, resolveCountryCurrentContext } from "./v3-country-current-context";

const country = { id: "country-1" };

function discovery(status?: "participating" | "withdrawn" | "disqualified"): CountryDiscovery {
  return {
    currentEdition: { id: "edition-22", edition_number: 22, name: "SSC 22" },
    participating: status === "participating" ? [country] : [],
    withdrawn: status === "withdrawn" ? [country] : [],
    disqualified: status === "disqualified" ? [country] : [],
    debuting: [],
    notParticipating: status ? [] : [country],
    regions: [],
  } as unknown as CountryDiscovery;
}

const available = { loading: false, error: false };

describe("Country profile current-edition summary", () => {
  it("labels an entry as current only when its published edition matches the active edition", () => {
    expect(isPublishedCurrentCountryEntry("active", "active", available)).toBe(true);
    expect(isPublishedCurrentCountryEntry("active", "archived", available)).toBe(false);
    expect(isPublishedCurrentCountryEntry(null, "archived", available)).toBe(false);
    expect(isPublishedCurrentCountryEntry("active", null, available)).toBe(false);
    expect(isPublishedCurrentCountryEntry("active", "active", { loading: true, error: false })).toBe(false);
    expect(isPublishedCurrentCountryEntry("active", "active", { loading: false, error: true })).toBe(false);
  });

  it.each([
    ["participating", "Participating"],
    ["withdrawn", "Withdrawn"],
    ["disqualified", "Disqualified"],
  ] as const)("uses the canonical published %s group", (status, expected) => {
    expect(resolveCountryCurrentContext(discovery(status), country.id, available)).toEqual({
      editionLabel: "SSC 22",
      status: expected,
    });
  });

  it("does not infer a private or still-unpublished participation decision from missing public rows", () => {
    expect(resolveCountryCurrentContext(discovery(), country.id, available)).toEqual({
      editionLabel: "SSC 22",
      status: "No published participation confirmed",
    });
  });

  it("does not describe missing or failed history queries as current-edition facts", () => {
    const stalePublished = discovery("participating");
    expect(resolveCountryCurrentContext(stalePublished, country.id, { loading: true, error: false }))
      .toEqual({ editionLabel: "Current edition", status: "Checking published participation…" });
    expect(resolveCountryCurrentContext(stalePublished, country.id, { loading: false, error: true }))
      .toEqual({ editionLabel: "Current edition", status: "Participation status unavailable" });
    expect(resolveCountryCurrentContext(stalePublished, country.id, { loading: true, error: true }))
      .toEqual({ editionLabel: "Current edition", status: "Participation status unavailable" });
  });

  it("distinguishes the published historical archive from an active contest", () => {
    expect(resolveCountryCurrentContext({ ...discovery(), currentEdition: null }, country.id, available))
      .toEqual({ editionLabel: "Country archive", status: "No active published edition" });
  });
});
