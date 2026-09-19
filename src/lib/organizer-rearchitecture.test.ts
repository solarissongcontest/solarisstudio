import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Organizer rearchitecture foundation", () => {
  it("keeps the permanent Organizer navigation intentionally small", () => {
    const domains = source("src/components/admin/admin-domains.ts");
    for (const label of ["Home", "Inbox", "Rules & Cases", "Administration"]) {
      expect(domains).toContain(`label: "${label}"`);
    }
    expect(domains).toContain('id: "edition"');
    expect(domains).not.toContain('label: "Voting & Results"');
    expect(domains).not.toContain('label: "Publishing"');
  });

  it("does not count show appearances as separate edition entries", () => {
    const readiness = source("src/lib/admin-readiness.ts");
    const contest = source("src/routes/_authenticated/admin/$slug.tsx");
    expect(readiness).toContain("const canonicalEntries = participants.filter");
    expect(readiness).toContain("const logicalEntries = canonicalEntries.length");
    expect(readiness).toContain('makeArea("entries", "Entries", Math.max(logicalEntries.length, 1)');
    expect(contest).toContain('<Metric label="Entries" value={logicalEntries.length} />');
  });

  it("does not expose unpublished result placeholders in MySolaris history", () => {
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");
    expect(mySolaris).toContain('import { showPublishesResults } from "@/lib/publication"');
    expect(mySolaris).toContain("const publishedResults = useMemo");
    expect(mySolaris).toContain('showPublishesResults(showById.get(row.show_id ?? ""))');
    expect(mySolaris).toContain("buildEditionProgressionPlacements(publishedResults");
  });

  it("uses workflow-owned schedule dates instead of pretending custom reminders control Solaris", () => {
    const schedule = source("src/lib/admin-schedule.ts");
    const system = source("src/routes/_authenticated/admin/system.tsx");
    const home = source("src/routes/_authenticated/admin/operations.tsx");

    expect(schedule).toContain('from("submission_rounds")');
    expect(schedule).toContain('"scheduled_publish_at"');
    expect(schedule).toContain('from("studio2_official_notices")');
    expect(system).toContain("Operational schedule");
    expect(system).toContain("Custom reminders");
    expect(system).toContain("never controls a submission round");
    expect(home).toContain("useAdminOperationalSchedule");
  });

  it("ignores zero-point materialized result placeholders in readiness", () => {
    const readiness = source("src/lib/admin-readiness.ts");
    expect(readiness).toContain("const hasSubstantiveResults = rawShowResults.some");
    expect(readiness).toContain("const showResults = hasSubstantiveResults ? rawShowResults : []");
    expect(readiness).toContain("meaningfulResultRows += showResults.length");
  });

  it("keeps show-level entry metrics on canonical logical entries", () => {
    const shows = source("src/routes/_authenticated/admin/shows/$slug.tsx");
    expect(shows).toContain("const canonicalEntries = participants.filter");
    expect(shows).toContain('<Metric label="Entries" value={logicalEntries.length} />');
  });

  it("requires explicit show publication before result rows can become public", () => {
    const migration = source(
      "supabase/migrations/20260919160642_results_require_show_publication.sql",
    );
    expect(migration).toContain("show_id is not null");
    expect(migration).toContain("show_publication_enabled(show_id, 'results')");
    expect(migration).not.toContain("e.published = true");
  });

  it("uses one Organizer edition context across the legacy Confirmations surfaces", () => {
    for (const path of [
      "src/routes/confirmations/admin/index.tsx",
      "src/routes/confirmations/admin/rounds.tsx",
      "src/routes/confirmations/admin/countries.tsx",
      "src/routes/confirmations/admin/calendar.tsx",
      "src/routes/confirmations/admin/settings.tsx",
      "src/routes/confirmations/admin/responses.tsx",
    ]) {
      expect(source(path)).toContain("useAdminContext");
    }

    const rounds = source("src/routes/confirmations/admin/rounds.tsx");
    const countries = source("src/routes/confirmations/admin/countries.tsx");
    const calendar = source("src/routes/confirmations/admin/calendar.tsx");
    expect(rounds).toContain("setOrganizerEditionId(nextEditionId)");
    expect(countries).toContain("setOrganizerEditionId(nextEditionId)");
    expect(calendar).toContain("setOrganizerEditionId(next)");
  });

  it("makes every country account imply the HOD role", () => {
    const migration = source(
      "supabase/migrations/20260919162001_country_accounts_imply_hod_role.sql",
    );
    expect(migration).toContain("ensure_country_account_hod_role");
    expect(migration).toContain("from public.country_accounts ca");
    expect(migration).toContain("'hod'::text");
    expect(migration).toContain("studio2_role_assignments_scope_unique");
  });

  it("blocks result publication until the authoritative result version is release ready", () => {
    const migration = source(
      "supabase/migrations/20260919162106_publication_requires_reveal_ready_results.sql",
    );
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );
    const operations = source("src/lib/studio2-results-operations.ts");

    expect(migration).toContain("reviewed_version is distinct from v_ops.calculation_version");
    expect(migration).toContain("locked_version is distinct from v_ops.calculation_version");
    expect(migration).toContain("reveal_ready_version is distinct from v_ops.calculation_version");
    expect(publication).toContain("isStudio2ResultReleaseReady");
    expect(publication).toContain("Not release ready");
    expect(operations).toContain("export function isStudio2ResultReleaseReady");
  });

  it("uses one Design workspace instead of a second Edition Theme editor", () => {
    const identity = source("src/components/studio/EditionArtworkControl.tsx");
    const legacyTheme = source("src/routes/_authenticated/admin/edition-theme.$slug.tsx");

    expect(identity).toContain("Fine-tune edition colours");
    expect(identity).toContain("synchroniseScoreboardThemes");
    expect(legacyTheme).toContain('to: "/admin/design/$slug"');
    expect(legacyTheme).toContain("replace: true");
  });

  it("provides an Inbox route and persistent Inbox affordance", () => {
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(inbox).toContain('createFileRoute("/_authenticated/admin/inbox")');
    expect(inbox).toContain("Needs attention");
    expect(shell).toContain('to="/admin/inbox"');
    expect(shell).toContain("unreadInboxCount");
  });
});
