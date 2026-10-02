import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  mapOrganizerTasksV5,
  type OrganizerTaskV5,
} from "./admin-tasks-v5";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 canonical Organizer Task Engine", () => {
  const migration = source(
    "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
  );
  const operationalSources = source(
    "supabase/migrations/20261002234500_organisation_os_v5_task_sources.sql",
  );
  const truthSources = source(
    "supabase/migrations/20261003001000_organisation_os_v5_task_truth_expansion.sql",
  );

  it("stores one task per source condition and keeps direct browser writes closed", () => {
    expect(migration).toContain("create table if not exists public.studio2_organizer_tasks");
    expect(migration).toContain("source_key text not null unique");
    expect(migration).toContain("required_capability text not null references public.studio2_capabilities");
    expect(migration).toContain("revoke all on table public.studio2_organizer_tasks from public, anon, authenticated");
    expect(migration).not.toContain("grant update on table public.studio2_organizer_tasks to authenticated");
  });

  it("derives resolution from domain truth instead of exposing mark-resolved commands", () => {
    expect(migration).toContain("private.studio2_reconcile_organizer_tasks");
    expect(migration).toContain("incident.status <> 'resolved'");
    expect(migration).toContain("integrity_case.status not like 'closed%'");
    expect(migration).toContain("appeal.status in ('submitted', 'under_review')");
    expect(migration).toContain("disclosure.status in ('pending', 'approved')");
    expect(migration).toContain("subsystem.value = 'paused'");
    expect(migration).not.toContain("admin_mark_organizer_task_resolved");
    expect(migration).not.toContain("p_resolved boolean");
  });

  it("keeps notifications as delivery while task resolution follows domain truth", () => {
    expect(migration).toContain("notification.source_key = task.source_key");
    expect(migration).toContain("notification.resolved_at is distinct from task.resolved_at");
    expect(migration).not.toContain("task.resolved_at = notification.read_at");
    expect(migration).not.toContain("task.resolved_at = notification.resolved_at");
  });

  it("filters every returned task through its own capability", () => {
    expect(migration).toContain(
      "public.studio2_access_allowed(task.required_capability, task.edition_id, false)",
    );
    expect(migration).toContain("'integrity.read'");
    expect(migration).toContain("'integrity.manage'");
    expect(migration).toContain("'incident.read'");
    expect(migration).toContain("'edition.manage'");
  });


  it("expands canonical tasks across submitted confirmations, jury, televote and results", () => {
    expect(operationalSources).toContain("'confirmation_review'");
    expect(operationalSources).toContain("submission.reviewed = false");
    expect(operationalSources).toContain("internal_entry.review_status = 'pending'");
    expect(operationalSources).toContain("'jury_missing_ballots'");
    expect(operationalSources).toContain("jury_window.status = 'open'");
    expect(operationalSources).toContain("ballot.status = 'submitted'");
    expect(operationalSources).toContain("ballot_status.status = 'did_not_vote'");
    expect(operationalSources).toContain("'televote_suspicious'");
    expect(operationalSources).toContain("submission.status = 'suspicious'");
    expect(operationalSources).toContain("'result_lifecycle'");
    expect(operationalSources).toContain(
      "result_operation.reveal_ready_version is distinct from result_operation.calculation_version",
    );
  });

  it("never turns an open confirmation round into a second confirmation requirement", () => {
    expect(operationalSources).toContain(
      "a round is a submission window, not a new requirement",
    );
    expect(operationalSources).not.toContain("submission_rounds round\n  where round.status = 'open'");
    expect(operationalSources).not.toContain("'confirmation_missing'");
    expect(operationalSources).not.toContain("'reconfirmation'");
  });

  it("keeps each operational source deduplicated by its domain object", () => {
    expect(operationalSources).toContain("'confirmation-review:' || submission.id::text");
    expect(operationalSources).toContain("'jury-missing-ballots:' || jury_window.show_id::text");
    expect(operationalSources).toContain("'televote-suspicious:' || round.id::text");
    expect(operationalSources).toContain("'result-lifecycle:' || result_operation.show_id::text");
    expect(operationalSources).toContain("on conflict (source_key) do update");
  });

  it("projects persisted entry, media and integration failures into canonical Tasks", () => {
    expect(truthSources).toContain("'entry_approval'");
    expect(truthSources).toContain("entry.status = 'pending'");
    expect(truthSources).toContain("nullif(btrim(entry.artist), '') is not null");
    expect(truthSources).toContain("nullif(btrim(entry.song_title), '') is not null");

    expect(truthSources).toContain("'media_required_fault'");
    expect(truthSources).toContain("participant.participation_status = 'confirmed'");
    expect(truthSources).toContain("entry.status = 'confirmed'");
    expect(truthSources).toContain("review.source_fingerprint = btrim(entry.song_url)");
    expect(truthSources).toContain("review.superseded_at is null");
    expect(truthSources).toContain("btrim(country.flag_image) !~* '^https?://'");
    expect(truthSources).toContain("btrim(entry.song_url) !~* '^https?://'");
    expect(truthSources).toContain("entry.metadata ->> 'video_processing' = 'true'");
    expect(truthSources).toContain("entry.metadata ->> 'videoProcessing' = 'true'");

    expect(truthSources).toContain("'integration_link_error'");
    expect(truthSources).toContain("link.sync_status = 'error'");
    expect(truthSources).toContain("'integration_failure'");
    expect(truthSources).toContain("private.studio2_current_integration_failures");
    expect(truthSources).toContain("failure.service = 'confirmations'");
  });

  it("uses one integration event vocabulary and resolves failed retries from later truth", () => {
    expect(truthSources).toContain(
      "check (status in ('pending', 'retrying', 'completed', 'failed', 'skipped'))",
    );
    expect(truthSources).toContain("'round.lineup.autosynced'");
    expect(truthSources).toContain("'round.lineup.autosync_failed'");
    expect(truthSources).toContain("'round.lineup.autosync'");
    expect(truthSources).toContain("distinct on (");
    expect(truthSources).toContain("latest.status = 'failed'");
  });

  it("does not invent publication work from optional staged release state", () => {
    expect(truthSources).toContain(
      "Do not create publication work merely because a result is",
    );
    expect(truthSources).not.toContain("'publication_pending'");
    expect(truthSources).not.toContain("'publish_results_now'");
    expect(truthSources).not.toContain("reveal_ready_version = calculation_version");
  });

  it("runs the truth reconciler inside the single authoritative Task wrapper", () => {
    expect(truthSources).toContain(
      "perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);",
    );
    expect(truthSources).toContain(
      "perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);",
    );
  });

  it("uses canonical Tasks for the mobile badge and dedicated Tasks screen", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    const route = source("src/routes/_authenticated/admin/tasks.tsx");

    expect(frame).toContain("useOrganizerTaskCountV5");
    expect(frame).toContain('item.id === "tasks"');
    expect(frame).toContain("unresolvedTaskCount");
    expect(route).toContain("useOrganizerTasksV5");
    expect(route).toContain("There is intentionally no generic “Mark resolved” button.");
    expect(route).toContain("confirmation requirements and reviews, entries, required media, voting, results, integrations");
    expect(route).toContain('to="/admin/inbox"');
  });

  it("maps strict task payloads instead of accepting malformed RPC state", () => {
    const sample: OrganizerTaskV5 = {
      id: "task-1",
      editionId: null,
      countryId: null,
      assignedTo: null,
      sourceKind: "incident",
      sourceKey: "studio2_incidents:1",
      taskType: "incident.response",
      priority: "critical",
      state: "open",
      title: "SEV1",
      description: "Respond",
      href: "/admin/incidents",
      dueAt: null,
      resolutionPredicate: { table: "studio2_incidents" },
      ruleReference: [],
      openedAt: "2026-10-02T20:00:00.000Z",
      resolvedAt: null,
      lastEvaluatedAt: "2026-10-02T20:00:00.000Z",
    };

    expect(mapOrganizerTasksV5([sample])).toEqual([sample]);
    expect(() => mapOrganizerTasksV5([{ ...sample, state: "invented" }])).toThrow(
      "Invalid Organizer Task shape",
    );
  });
});
