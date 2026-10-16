import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const countries = readFileSync("src/routes/_authenticated/admin/countries.tsx", "utf8");
const countryDetail = readFileSync("src/routes/_authenticated/admin/countries.$countryId.tsx", "utf8");
const confirmations = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
const confirmationRounds = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
const confirmationCalendar = readFileSync("src/routes/confirmations/admin/calendar.tsx", "utf8");
const confirmationCountries = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");
const eligibility = readFileSync("src/routes/_authenticated/admin/eligibility.tsx", "utf8");
const media = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");
const results = readFileSync("src/routes/_authenticated/admin/results.tsx", "utf8");

const protectedRoutes = [
  ["Control", control],
  ["Delegations", countries],
  ["Delegation detail", countryDetail],
  ["Confirmations", confirmations],
  ["Confirmation rounds", confirmationRounds],
  ["Delegation calendar", confirmationCalendar],
  ["Responses by country", confirmationCountries],
  ["Eligibility", eligibility],
  ["Media review", media],
  ["Results", results],
] as const;

describe("V3 Organizer explicit edition context", () => {
  it.each(protectedRoutes)("keeps %s fail-closed instead of guessing the newest edition", (_label, source) => {
    expect(source).not.toMatch(/sort\([^\n]*edition_number/);
    expect(source).not.toContain("ordered[0]");
  });

  it("uses exact-match Organizer edition selection in scoped specialist workspaces", () => {
    expect(countries).toContain("selectOrganizerEdition(editions, editionId)");
    expect(countryDetail).toContain("selectOrganizerEdition(editions, editionId)");
    expect(eligibility).toContain("selectOrganizerEdition(editions, editionId)");
    expect(media).toContain("selectOrganizerEdition(editions, editionId)");
    expect(results).toContain("selectOrganizerEdition(editions, editionId)");
  });

  it("keeps Confirmation O4 surfaces bound to OrganizerContext without active/first-edition fallback", () => {
    expect(confirmations).toContain("useAdminContext()");
    expect(confirmations).toContain("editions.find((edition) => edition.id === organizerEditionId) ?? null");
    expect(confirmations).not.toContain('edition.status === "active"');
    expect(confirmations).not.toContain("editions[0]");

    for (const source of [confirmationRounds, confirmationCalendar, confirmationCountries]) {
      expect(source).toContain("organizerEditionId");
      expect(source).not.toContain('item.status === "active"');
      expect(source).not.toContain("editionRows[0]");
      expect(source).not.toContain("rows[0]");
    }
  });

  it("never broadens Confirmation data when Organizer edition context is absent", () => {
    expect(confirmationRounds).toContain('title="Select an edition"');
    expect(confirmationCalendar).toContain('title="Select an edition"');
    expect(confirmationCountries).toContain('title="Select an edition"');
    expect(confirmationCalendar).toContain("setRows([])");
    expect(confirmationCountries).toContain("editionId ? rows.filter");
  });

  it("guards delegation children before rendering legacy detail content", () => {
    expect(countries).toContain("if (pathname.startsWith('/admin/countries/'))");
    expect(countries).toContain("if (!selectedEdition)");
    expect(countries).toContain("Edition context required");
    expect(countries).toContain("return <Outlet />;");
  });

  it("keeps Control exact-match scoped while consuming the Organizer projection", () => {
    expect(control).toContain("editions.find((edition) => edition.id === editionId) ?? null");
    expect(control).toContain("useV3OrganizerProjection(activeEdition?.id)");
    expect(control).not.toContain("ordered[0]");
  });

  it("explains why missing scope does not silently switch editions", () => {
    expect(countries).toContain("will not substitute another edition");
    expect(countryDetail).toContain("will not substitute another edition");
    expect(confirmations).toContain("will not substitute the globally active confirmation edition");
    expect(confirmationRounds).toContain("will not substitute the globally active or newest edition");
    expect(confirmationCalendar).toContain("will not load a globally active or first edition");
    expect(confirmationCountries).toContain("will not merge responses across editions");
    expect(eligibility).toContain("will not substitute another edition");
    expect(media).toContain("will not substitute another edition");
  });
});
