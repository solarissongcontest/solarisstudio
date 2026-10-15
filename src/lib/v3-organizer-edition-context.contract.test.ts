import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const countries = readFileSync("src/routes/_authenticated/admin/countries.tsx", "utf8");
const countryDetail = readFileSync("src/routes/_authenticated/admin/countries.$countryId.tsx", "utf8");
const results = readFileSync("src/routes/_authenticated/admin/results.tsx", "utf8");

const protectedRoutes = [
  ["Control", control],
  ["Delegations", countries],
  ["Delegation detail", countryDetail],
  ["Results", results],
] as const;

describe("V3 Organizer explicit edition context", () => {
  it.each(protectedRoutes)("keeps %s fail-closed instead of guessing the newest edition", (_label, source) => {
    expect(source).not.toMatch(/sort\([^\n]*edition_number/);
    expect(source).not.toContain("ordered[0]");
  });

  it("uses the shared exact-match selector in delegation detail and Results", () => {
    expect(countryDetail).toContain('selectOrganizerEdition(editions, editionId)');
    expect(results).toContain('selectOrganizerEdition(editions, editionId)');
  });

  it("keeps Control and the delegation list exact-match scoped", () => {
    expect(control).toContain('editions.find((edition) => edition.id === editionId) ?? null');
    expect(countries).toContain('selectOrganizerEdition(editions, editionId)');
  });

  it("documents why stale or missing scope does not silently switch editions", () => {
    expect(control).toContain("Solaris will not guess a different edition for you");
    expect(countries).toContain("will not substitute another edition");
    expect(countryDetail).toContain("will not substitute another edition");
  });
});
