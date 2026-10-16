import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");
const tasksData = readFileSync("src/lib/admin-tasks-v5.ts", "utf8");
const countries = readFileSync("src/routes/_authenticated/admin/countries.tsx", "utf8");
const countryDetail = readFileSync("src/routes/_authenticated/admin/countries.$countryId.tsx", "utf8");
const confirmations = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
const confirmationRounds = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");
const confirmationCalendar = readFileSync("src/routes/confirmations/admin/calendar.tsx", "utf8");
const confirmationCountries = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");
const confirmationResponses = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");
const confirmationSettings = readFileSync("src/routes/confirmations/admin/settings.tsx", "utf8");
const recoveryCodes = readFileSync("src/routes/confirmations/admin/recovery-codes.tsx", "utf8");
const confirmationAdmin = readFileSync("src/integrations/confirmations/admin.ts", "utf8");
const eligibility = readFileSync("src/routes/_authenticated/admin/eligibility.tsx", "utf8");
const media = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");
const results = readFileSync("src/routes/_authenticated/admin/results.tsx", "utf8");
const communications = readFileSync("src/routes/_authenticated/admin/communications.tsx", "utf8");
const communicationsData = readFileSync("src/lib/studio2-communications.ts", "utf8");

const protectedRoutes = [
  ["Control", control],
  ["Tasks", tasks],
  ["Delegations", countries],
  ["Delegation detail", countryDetail],
  ["Confirmations", confirmations],
  ["Confirmation rounds", confirmationRounds],
  ["Delegation calendar", confirmationCalendar],
  ["Responses by country", confirmationCountries],
  ["Entry review responses", confirmationResponses],
  ["Confirmation settings", confirmationSettings],
  ["Eligibility", eligibility],
  ["Media review", media],
  ["Results", results],
  ["Communications", communications],
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

    for (const source of [
      confirmationRounds,
      confirmationCalendar,
      confirmationCountries,
      confirmationResponses,
      confirmationSettings,
    ]) {
      expect(source).toContain("organizerEditionId");
      expect(source).not.toContain('item.status === "active"');
      expect(source).not.toContain('edition.status === "active"');
      expect(source).not.toContain("editionRows[0]");
      expect(source).not.toContain("rows[0]");
      expect(source).not.toContain("editions[0]");
    }
  });

  it("never broadens Confirmation data when Organizer edition context is absent", () => {
    expect(confirmationRounds).toContain('title="Select an edition"');
    expect(confirmationCalendar).toContain('title="Select an edition"');
    expect(confirmationCountries).toContain('title="Select an edition"');
    expect(confirmationResponses).toContain('title="Select an edition"');
    expect(confirmationCalendar).toContain("setRows([])");
    expect(confirmationCountries).toContain("editionId ? rows.filter");
    expect(confirmationResponses).toContain("editionId ? rows.filter");
    expect(confirmationSettings).toContain("No edition selected");
  });

  it("keeps Recovery Access explicitly blocked on a server-side edition-scoped contract", () => {
    expect(recoveryCodes).toContain("loadConfirmationRecoveryCodes()");
    expect(confirmationAdmin).toContain('rpc("admin_confirmation_recovery_codes")');
    expect(confirmationAdmin).not.toContain('rpc("admin_confirmation_recovery_codes",');
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

  it("keeps Organizer Tasks fail-closed to the selected edition", () => {
    expect(tasks).toContain("tasksSupported && Boolean(editionId)");
    expect(tasks).toContain("Boolean(editionId) &&");
    expect(tasks).toContain('title="Choose an edition"');
    expect(tasks).toContain("never merges task truth across editions when Organizer scope is missing");

    expect(tasksData).toContain("Organizer Tasks requires an explicit edition scope.");
    expect(tasksData).toContain("const normalizedEditionId = requireOrganizerEditionId(editionId)");
    expect(tasksData).toContain("p_edition_id: normalizedEditionId");
    expect(tasksData).toContain("enabled: enabled && Boolean(normalizedEditionId)");
    expect(tasksData).toContain('normalizedEditionId ?? "unscoped"');
    expect(tasksData).not.toContain('normalizedEditionId ?? "all"');
  });

  it("keeps Official Communications fail-closed to the selected Organizer edition", () => {
    expect(communications).toContain("enabled: Boolean(editionId)");
    expect(communications).toContain("return loadStudio2Notices(editionId)");
    expect(communications).toContain("editionId ?? 'unscoped'");
    expect(communications).not.toContain("editionId ?? 'all'");
    expect(communications).not.toContain("editionId: editionId ?? null");
    expect(communications).toContain("if (!editionId) throw new Error('Choose an edition before creating Official Communications.')");
    expect(communications).toContain("editionId,");
    expect(communications).toContain("enabled: Boolean(editionId && selectedNotice)");
    expect(communications).toContain("selectedNotice.editionId !== editionId");
    expect(communications).toContain('title="Choose an edition"');
    expect(communications).toContain("never broadens a missing edition into an all-editions view");

    expect(communicationsData).toContain("if (!editionId)");
    expect(communicationsData).toContain("Official Communications requires an explicit edition scope.");
    expect(communicationsData).toContain(".eq('edition_id', editionId)");
    expect(communicationsData).not.toContain("if (editionId) noticeQuery = noticeQuery.eq('edition_id', editionId)");
  });

  it("explains why missing scope does not silently switch editions", () => {
    expect(tasks).toContain("never merges task truth across editions when Organizer scope is missing");
    expect(countries).toContain("will not substitute another edition");
    expect(countryDetail).toContain("will not substitute another edition");
    expect(confirmations).toContain("will not substitute the globally active confirmation edition");
    expect(confirmationRounds).toContain("will not substitute the globally active or newest edition");
    expect(confirmationCalendar).toContain("will not load a globally active or first edition");
    expect(confirmationCountries).toContain("will not merge responses across editions");
    expect(confirmationResponses).toContain("exact edition selected in Solaris Organizer");
    expect(confirmationSettings).toContain("will not substitute a globally active or first edition");
    expect(eligibility).toContain("will not substitute another edition");
    expect(media).toContain("will not substitute another edition");
    expect(communications).toContain("never broadens a missing edition into an all-editions view");
  });
});
