import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseStudio2ResultPreconditions } from "./studio2-results-operations";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production Organizer audit regressions", () => {
  it("never substitutes another edition inside Results operations", () => {
    const results = source("src/routes/_authenticated/admin/results.tsx");

    expect(results).toContain("selectOrganizerEdition");
    expect(results).not.toContain("sort((a, b) => (b.edition_number");
  });

  it("keeps Organizer edition selection isolated to one browser tab", () => {
    const context = source("src/components/admin/AdminContext.tsx");

    expect(context).toContain("window.sessionStorage");
    expect(context).not.toContain("window.localStorage");
  });

  it("keeps custom reminders out of HOD workflow deadlines", () => {
    const migration = source(
      "supabase/migrations/20260920084500_separate_hod_reminders_and_result_lifecycle.sql",
    );

    expect(migration).toContain("'deadlines', '[]'::jsonb");
    expect(migration).toContain("Organizer reminders");
  });

  it("requires a governed version before calling results calculated", () => {
    const migration = source(
      "supabase/migrations/20260920084500_separate_hod_reminders_and_result_lifecycle.sql",
    );

    expect(migration).toContain("r.calculation_version > 0");
    expect(migration).toContain("then 'calculated'");
  });

  it("uses one canonical readiness projection for Home and the health strip", () => {
    const home = source("src/routes/_authenticated/admin/operations.tsx");
    const strip = source("src/components/admin/AdminHealthStrip.tsx");

    expect(home).toContain("buildEditionReadiness");
    expect(home).toContain("useAdminReadinessData");
    expect(strip).toContain("buildEditionReadiness");
    expect(strip).toContain("useAdminReadinessData");
    expect(strip).not.toContain("useAdminHealthSummary");
  });

  it("treats qualifiers as protected result outcomes in both UI and database", () => {
    const publication = source("src/routes/_authenticated/admin/publication/$slug.tsx");
    const migration = source(
      "supabase/migrations/20260919212825_guard_outcome_layers_insert_update.sql",
    );

    expect(publication).toContain('"qualifiers", "results"');
    expect(publication).toContain("newlyExposesOutcome");
    expect(publication).toContain("New outcome publication is blocked");
    expect(migration).toContain("publication_config ->> 'qualifiers'");
    expect(migration).toContain("tg_op = 'INSERT'");
    expect(migration).toContain("reveal_ready_version is distinct from v_ops.calculation_version");
  });

  it("does not call mismatched result entities reconciled", () => {
    const parsed = parseStudio2ResultPreconditions({
      participantCount: 20,
      juryEnabled: false,
      juryRequiredPoints: 0,
      juryVoterCount: 0,
      juryVoteRows: 0,
      juryDnvCount: 0,
      juryIncompleteCount: 0,
      juryConflictCount: 0,
      juryReady: true,
      televoteEnabled: true,
      televoteVoteRows: 21,
      televoteReady: true,
      calculationReady: true,
      resultRowCount: 21,
      reconcileIssueCount: 0,
      resultReady: true,
      publishedResults: false,
    });

    expect(parsed.entityCountMismatch).toBe(1);
    expect(parsed.sourceReconcileIssueCount).toBe(0);
    expect(parsed.reconcileIssueCount).toBe(1);
    expect(parsed.resultReady).toBe(false);
  });

  it("explains entity-count mismatches in result reconciliation", () => {
    const results = source("src/routes/_authenticated/admin/results.tsx");

    expect(results).toContain("participant/result-row count mismatch");
    expect(results).toContain("sourceReconcileIssueCount");
  });

  it("renders a branded Organizer not-found page instead of a blank route", () => {
    const notFound = source("src/routes/_authenticated/admin/$.tsx");

    expect(notFound).toContain("This Organizer page does not exist");
    expect(notFound).toContain('to="/admin/operations"');
    expect(notFound).toContain('to="/admin/menu"');
  });

  it("keeps custom reminders visually and semantically separate from workflows", () => {
    const schedule = source("src/lib/admin-schedule.ts");
    const home = source("src/routes/_authenticated/admin/operations.tsx");

    expect(schedule).toContain('source: "reminder"');
    expect(schedule).toContain("Organizer reminder · does not control a Solaris workflow");
    expect(home).toContain('upcoming.source === "reminder"');
    expect(home).toContain('"Open reminder"');
  });

  it("keeps Inbox read state separate from unresolved actionable work", () => {
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const home = source("src/routes/_authenticated/admin/operations.tsx");

    expect(inbox).toContain("item.requires_action && !item.resolved_at");
    expect(inbox).toContain("filter === \"unread\"");
    expect(home).toContain("item.requires_action && !item.resolved_at");
    expect(home).toContain("unresolved work stays here after it is read");
  });

  it("supports both create and edit states for country-account confirmations", () => {
    const confirmations = source("src/routes/confirmations/index.tsx");

    expect(confirmations).toContain("resolveCountryConfirmationRoundState");
    expect(confirmations).toContain("selectedAccountResponse");
    expect(confirmations).toContain("ConfirmationFormWithReceipt");
    expect(confirmations).toContain("createCountryAccountConfirmationEditToken");
    expect(confirmations).toContain("This confirmation could not be opened for editing.");
  });

  it("replaces unauthorized Organizer URLs with MySolaris and explains why", () => {
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");

    expect(adminRoute).toContain('to: "/my-solaris"');
    expect(adminRoute).toContain('notice: "organizer-access-required"');
    expect(adminRoute).toContain("replace: true");
    expect(mySolaris).toContain("Organizer access required");
    expect(mySolaris).toContain("does not have Organizer access");
  });

  it("keeps informational Inbox events separate from actionable work", () => {
    const migration = source(
      "supabase/migrations/20260919212632_organizer_inbox_actionable_severity.sql",
    );
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");

    expect(migration).toContain("p_severity not in ('info', 'success')");
    expect(migration).toContain("set requires_action = false");
    expect(inbox).toContain("item.requires_action && !item.resolved_at");
  });

  it("uses the unified MySolaris priority list for the Next action card", () => {
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");

    expect(mySolaris).toContain("const { priorities } = useMySolaris()");
    expect(mySolaris).toContain("primaryRequiredAction");
    expect(mySolaris).toContain("Action required");
  });

  it("requires lifecycle readiness before moving into show phases", () => {
    const controlRoom = source("src/routes/_authenticated/admin/control-room.tsx");

    expect(controlRoom).toContain("transitionReadinessBlockers");
    expect(controlRoom).toContain("blockedByReadiness");
    expect(controlRoom).toContain("Complete {blockers.length} prerequisite");
    expect(controlRoom).toContain("Required setup checks pass for this transition");
  });

  it("asks before discarding unsaved publication changes", () => {
    const publication = source("src/routes/_authenticated/admin/publication/$slug.tsx");

    expect(publication).toContain("draftHasUnsavedChanges");
    expect(publication).toContain("requestCloseDraft");
    expect(publication).toContain("Discard unsaved publication changes?");
    expect(publication).toContain("Discard changes");
  });

  it("keeps exact country entities ahead of governance full-text results", () => {
    const search = source("src/components/admin/AdminCommandPalette.tsx");

    expect(search).toContain("const countryItems = countries.map");
    expect(search).toContain("...countryItems");
    expect(search.indexOf("...countryItems")).toBeLessThan(search.indexOf("...navigation"));
    expect(search).toContain("group: \"Countries\"");
  });
});
