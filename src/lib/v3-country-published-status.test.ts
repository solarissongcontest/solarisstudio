import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publishedCountryStatusMap } from "./v3-country-published-status";

const publishedGroups = {
  participating: [{ id: "a" }, { id: "b" }],
  withdrawn: [{ id: "c" }],
  disqualified: [{ id: "d" }],
};

describe("V3 Country directory current-edition status labels", () => {
  it("derives only published Country status, keyed by stable Country id", () => {
    const statuses = publishedCountryStatusMap(publishedGroups, true);
    expect([...statuses.entries()]).toEqual([
      ["a", "participating"],
      ["b", "participating"],
      ["c", "withdrawn"],
      ["d", "disqualified"],
    ]);
    expect(statuses.get("not-published")).toBeUndefined();
  });

  it("never invents statuses while current participants are loading or unavailable", () => {
    expect([...publishedCountryStatusMap(publishedGroups, false)]).toEqual([]);
  });

  it("shows statuses only in All Countries and across all three presentations", () => {
    const screen = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
    expect(screen).toContain("publishedCountryStatusMap(discovery, currentLineupReady)");
    expect(screen).toContain("selectedParticipatingOnly ? undefined : publishedStatuses.get(country.id)");
    expect(screen).toContain("data-country-current-status={status}");
    expect(screen).toContain("Current edition · {PUBLISHED_STATUS_LABELS[status]}");
    expect(screen).toContain('presentation === "mobile-web"');
    expect(screen).toContain('presentation === "desktop-web"');
    expect(screen.match(/<CountryStatusNote status={status}/g)?.length).toBe(3);
    expect(screen).toContain('to="/countries/$code"');
  });
});
