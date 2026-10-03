import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 jury ballot lifecycle", () => {
  const lifecycle = source(
    "supabase/migrations/20261003193000_organisation_os_v5_jury_ballot_lifecycle.sql",
  );
  const tasks = source(
    "supabase/migrations/20261003194500_organisation_os_v5_jury_ballot_tasks.sql",
  );
  const juryResults = source(
    "supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql",
  );
  const route = source("src/routes/_authenticated/admin/jury/$slug.tsx");

  it("keeps submitted evidence immutable while reviewing its lifecycle", () => {
    expect(lifecycle).toContain(
      "status in (\n      'submitted',\n      'valid',\n      'needs_review',\n      'invalidated',\n      'superseded'",
    );
    expect(lifecycle).toContain("review_version bigint not null default 1");
    expect(lifecycle).toContain("review_reason text");
    expect(lifecycle).toContain("reviewed_by uuid");
    expect(lifecycle).not.toContain("delete from public.jury_votes");
  });

  it("validates every submitted-ballot review transition server-side", () => {
    expect(lifecycle).toContain("studio2_jury_ballot_transition_allowed");
    expect(lifecycle).toContain("'submitted->valid'");
    expect(lifecycle).toContain("'submitted->needs_review'");
    expect(lifecycle).toContain("'valid->invalidated'");
    expect(lifecycle).toContain("'invalidated->valid'");
    expect(lifecycle).toContain("'needs_review->superseded'");
    expect(lifecycle).toContain("Invalid jury ballot transition");
    expect(lifecycle).toContain("using errcode = '23514'");
  });

  it("makes review changes previewed, version-bound, idempotent and audited", () => {
    expect(lifecycle).toContain("studio2_jury_ballot_review_preview");
    expect(lifecycle).toContain("studio2_apply_jury_ballot_review");
    expect(lifecycle).toContain("'expectedVersion', v_ballot.review_version");
    expect(lifecycle).toContain("v_ballot.review_version is distinct from p_expected_version");
    expect(lifecycle).toContain("private.studio2_claim_operation");
    expect(lifecycle).toContain("private.studio2_complete_operation");
    expect(lifecycle).toContain("'jury_ballot_review_transition'");
    expect(lifecycle).toContain("'status', v_before_status");
  });

  it("models DNV separately because no ballot evidence exists", () => {
    expect(lifecycle).toContain("studio2_jury_dnv_preview");
    expect(lifecycle).toContain("studio2_apply_jury_dnv");
    expect(lifecycle).toContain("Clear saved jury scores before authorizing DNV");
    expect(lifecycle).toContain("A reason is required for DNV changes");
    expect(lifecycle).toContain("'jury.dnv.' || v_action");
    expect(lifecycle).toContain("'did_not_vote'");
  });

  it("closes direct Organizer DNV table mutation bypasses", () => {
    expect(lifecycle).toContain(
      "revoke insert, update, delete on public.jury_ballot_statuses from authenticated",
    );
    expect(lifecycle).toContain('"jury ballot statuses capability read"');
    expect(route).not.toContain('.from("jury_ballot_statuses").delete()');
    expect(route).not.toContain('.from("jury_ballot_statuses").insert(');
    expect(route).not.toContain('.from("jury_ballot_statuses").update(');
    expect(route).toContain("studio2_jury_dnv_preview");
    expect(route).toContain("studio2_apply_jury_dnv");
  });

  it("exposes Organizer ballot validation without rewriting submitted vote rows", () => {
    expect(route).toContain("Ballot validation");
    expect(route).toContain("studio2_jury_ballot_review_preview");
    expect(route).toContain("studio2_apply_jury_ballot_review");
    expect(route).toContain("Mark valid");
    expect(route).toContain("Needs review");
    expect(route).toContain("Invalidate");
    expect(route).toContain("Supersede");
  });

  it("preserves pre-V5 accepted ballots while making new submissions reviewable", () => {
    expect(lifecycle).toContain("Pre-V5 submitted ballots were already accepted");
    expect(lifecycle).toContain("status = 'valid'");
    expect(lifecycle).toContain("where status = 'submitted'");
    expect(lifecycle).toContain("submissions created after");
  });

  it("makes ballot review state authoritative for canonical Results", () => {
    expect(juryResults).toContain("j.ballot_submission_id is null");
    expect(juryResults).toContain("submission.status = 'valid'");
    expect(juryResults).toContain(
      "jury_vote.ballot_submission_id is null",
    );
    expect(juryResults).toContain(
      "studio2_sync_results_after_jury_ballot_review",
    );
    expect(juryResults).toContain("after update of status on public.jury_ballot_submissions");
    expect(juryResults).toContain("'juryPendingReviewCount'");
    expect(juryResults).toContain("'juryInvalidatedCount'");
  });

  it("previews the required DNV effects instead of treating DNV as a naked flag", () => {
    expect(lifecycle).toContain("'readinessEffect'");
    expect(lifecycle).toContain("'resultsEffect'");
    expect(lifecycle).toContain("'taskEffect'");
    expect(lifecycle).toContain(
      "Authorized DNV replaces the missing ballot requirement.",
    );
  });

  it("projects outstanding validation into canonical Tasks and Inbox", () => {
    expect(tasks).toContain("studio2_reconcile_jury_ballot_review_tasks");
    expect(tasks).toContain("'jury_ballot_review'");
    expect(tasks).toContain("'jury.ballot.review'");
    expect(tasks).toContain("'jury.ballots.manage'");
    expect(tasks).toContain("ballot.status in ('submitted', 'needs_review')");
    expect(tasks).toContain(
      "'resolvedWhen', jsonb_build_array('valid', 'invalidated', 'superseded')",
    );
    expect(tasks).toContain("private.studio2_sync_task_notifications");
  });
});
