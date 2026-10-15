import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const countries = readFileSync("src/routes/_authenticated/admin/countries.tsx", "utf8");
const countryDetail = readFileSync("src/routes/_authenticated/admin/countries.$countryId.tsx", "utf8");
const confirmations = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
const eligibility = readFileSync("src/routes/_authenticated/admin/eligibility.tsx", "utf8");
const media = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");
const results = readFileSync("src/routes/_authenticated/admin/results.tsx", "utf8");

const protectedRoutes = [
  ["Control", control],
  ["Delegations", countries],
  ["Delegation detail", countryDetail],
  ["Confirmations", confirmations],
  ["Eligibility", eligibility],
  ["Media review", media],
  ["Results", results],
] as const;

describe("V3 Organizer explicit edition context", () => {
  it.each(protectedRoutes)("keeps %s fail-closed instead of guessing the newest edition", (_label, source) => {
    expect(source).not.toMatch(/sort\([^\n]*edition_number/);
    expect(source).not.toContain("ordered[0]");
  });

  it("uses the shared exact-match selector in scoped specialist workspaces", () => {
    expect(countries).toContain('selectOrganizerEdition(editions, editionId)');
    expect(countryDetail).toContain('selectOrganizerEdition(editions, editionId)');
    expect(eligibility).toContain('selectOrganizerEdition(editions, editionId)');
    expect(media).toContain('selectOrganizerEdition(editions, editionId)');
    expect(results).toContain('selectOrganizerEdition(editions, editionId)');
  });

  it("keeps legacy Confirmations bound to OrganizerContext without active/first-edition fallback", () => {
    expect(confirmations).toContain('useAdminContext()');
    expect(confirmations).toContain('editions.find((edition) => edition.id === organizerEditionId) ?? null');
    expect(confirmations).not.toContain('edition.status === "active"');
    expect(confirmations).not.toContain('editions[0]');
  });

  it("keeps Control exact-match scoped while it consumes the Organizer projection", () => {
    expect(control).toContain('editions.find((edition) => edition.id === editionId) ?? null');
    expect(control).toContain('useV3OrganizerProjection(activeEdition?.id)');
  });

  it("documents why stale or missing scope does not silently switch editions", () => {
    expect(control).toContain("Solaris will not guess a different edition for you");
    expect(countries).toContain("will not substitute another edition");
    expect(countryDetail).toContain("will not substitute another edition");
    expect(confirmations).toContain("will not substitute the globally active confirmation edition");
    expect(eligibility).toContain("will not substitute another edition");
    expect(media).toContain("will not substitute another edition");
  });
});
