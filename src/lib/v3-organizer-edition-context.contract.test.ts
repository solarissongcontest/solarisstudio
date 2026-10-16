import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");
const tasksData = readFileSync("src/lib/admin-tasks-v5.ts", "utf8");
const workflows = readFileSync("src/routes/_authenticated/admin/workflows.tsx", "utf8");
const adminOps = readFileSync("src/lib/admin-ops.ts", "utf8");
const incidents = readFileSync("src/routes/_authenticated/admin/incidents.tsx", "utf8");
const resultsReveal = readFileSync("src/routes/_authenticated/admin/results-reveal.tsx", "utf8");
const broadcastRundown = readFileSync("src/routes/_authenticated/admin/broadcast-rundown.tsx", "utf8");
const productionDesign = readFileSync("src/routes/_authenticated/admin/design.$slug.tsx", "utf8");
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
  ["Workflows", workflows],
  ["Incidents", incidents],
  ["Results Reveal", resultsReveal],
  ["Broadcast Rundown", broadcastRundown],
  ["Production design", productionDesign],
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
    expect(workflows).toContain("selectOrganizerEdition(editions, editionId)");
    expect(incidents).toContain("selectOrganizerEdition(editions, editionId)");
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

  it("keeps Workflows fail-closed while preserving explicitly global deadline tooling", () => {
    expect(workflows).toContain("selectOrganizerEdition(editions, editionId)");
    expect(workflows).not.toContain("edition_number ?? -1");
    expect(workflows).toContain("useEditionAdminDeadlines(resolvedEditionId || null)");
    expect(workflows).toContain('title="Choose an edition"');
    expect(workflows).toContain("will not substitute the newest or globally active edition");

    expect(adminOps).toContain("export function useEditionAdminDeadlines");
    expect(adminOps).toContain("enabled: Boolean(normalizedEditionId)");
    expect(adminOps).toContain('normalizedEditionId ?? "unscoped"');
    expect(adminOps).toContain("Edition deadlines require an explicit Organizer edition scope.");
    expect(adminOps).toContain("export function useAdminDeadlines");
    expect(adminOps).toContain('editionId ?? "all"');
  });

  it("keeps Incident Command exact-scoped across reads, creates and detail mutations", () => {
    expect(incidents).toContain("selectOrganizerEdition(editions, editionId)");
    expect(incidents).not.toContain("edition_number ?? -1");
    expect(incidents).toContain("enabled: Boolean(resolvedEditionId) && featureQuery.data === true");
    expect(incidents).toContain("Choose an edition before opening an incident.");
    expect(incidents).toContain('title="Choose an edition"');
    expect(incidents).toContain("will not substitute the newest or globally active edition");
    expect(incidents).toContain("incident.editionId !== editionId");
    expect(incidents).toContain("Edition context changed before the incident command");
  });

  it("keeps Live reveal and rundown work fail-closed to Organizer edition scope", () => {
    expect(resultsReveal).toContain("useShows(editionId ?? undefined)");
    expect(resultsReveal).toContain("useContestEntities(editionId ?? undefined)");
    expect(resultsReveal).toContain("enabled: Boolean(editionId)");
    expect(resultsReveal).toContain("editionId ?? 'unscoped'");
    expect(resultsReveal).toContain("isStudio2FeatureEnabled('results_replay', editionId!)");
    expect(resultsReveal).toContain('title="Choose an edition"');
    expect(resultsReveal).toContain("will not infer another edition or load an unscoped Results Replay flag");

    expect(broadcastRundown).toContain("useShows(editionId ?? undefined)");
    expect(broadcastRundown).toContain("validateEditionCommandScope");
    expect(broadcastRundown).toContain("routeEditionId: editionId ?? null");
    expect(broadcastRundown).toContain("commandEditionId: editionId ?? null");
    expect(broadcastRundown).toContain("entityEditionId: show?.edition_id ?? null");
    expect(broadcastRundown).toContain('title="Choose an edition"');
    expect(broadcastRundown).toContain("never substitutes another edition for live production work");
  });

  it("keeps Production design reads and legacy saves bound to the selected edition", () => {
    expect(productionDesign).toContain("useAdminContext()");
    expect(productionDesign).toContain("editionId: organizerEditionId");
    expect(productionDesign).toContain("useShows(edition?.id)");
    expect(productionDesign).toContain("useParticipants(edition?.id)");
    expect(productionDesign).not.toContain("useAllShows");
    expect(productionDesign).not.toContain("useAllParticipants");
    expect(productionDesign).toContain("organizerEditionId !== edition.id");
    expect(productionDesign).toContain("assertEditionScope()");
    expect(productionDesign).toContain("Edition context changed before this Production save");
    expect(productionDesign).toContain('title="Confirming edition context"');
    expect(productionDesign).toContain("will not save into a different edition while context is changing");
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
    expect(workflows).toContain("will not substitute the newest or globally active edition");
    expect(incidents).toContain("will not substitute the newest or globally active edition");
    expect(resultsReveal).toContain("will not infer another edition or load an unscoped Results Replay flag");
    expect(broadcastRundown).toContain("never substitutes another edition for live production work");
    expect(productionDesign).toContain("will not save into a different edition while context is changing");
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
