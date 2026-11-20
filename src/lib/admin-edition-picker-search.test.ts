import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { matchesOrganizerEditionSearch } from "./admin-edition-picker-search";

const edition = {
  name: "Ørnådal / Ålanti",
  slug: "ssc-22",
  host_city: "Malmö",
  edition_number: 22,
};

describe("Organizer edition switcher search", () => {
  it("finds edition and host names without diacritics", () => {
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "ornadal")).toBe(true);
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "alanti")).toBe(true);
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "malmo")).toBe(true);
  });

  it("matches unordered terms across edition, number and host city", () => {
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "malmo 22")).toBe(true);
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "ornadal ssc")).toBe(true);
    expect(matchesOrganizerEditionSearch(edition, "SSC 22 · Ørnådal", "unknown 22")).toBe(false);
  });

  it("includes all editions for blank search and tolerates missing metadata", () => {
    const sparse = { name: "SSC", slug: "ssc", host_city: null, edition_number: null };
    expect(matchesOrganizerEditionSearch(sparse, "SSC", "")).toBe(true);
    expect(matchesOrganizerEditionSearch(sparse, "SSC", "bergen")).toBe(false);
  });

  it("keeps a touch-friendly trigger and communicates selection", () => {
    const source = readFileSync("src/components/admin/AdminSelectors.tsx", "utf8");
    expect(source).toContain("matchesOrganizerEditionSearch(");
    expect(source).toContain('className="flex min-h-11 max-w-[10rem]');
    expect(source).toContain("aria-pressed={active}");
  });
});
