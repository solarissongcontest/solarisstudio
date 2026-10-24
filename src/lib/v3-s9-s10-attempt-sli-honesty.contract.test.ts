import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024190500_v3_s9_s10_attempt_sli_honesty.sql",
  ),
  "utf8",
);
const workflowSli = readFileSync(
  resolve(process.cwd(), "src/lib/v3-workflow-sli.ts"),
  "utf8",
);
const confirmation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql"),
  "utf8",
);
const televote = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016043000_v3_s5_televote_consequences.sql"),
  "utf8",
);
const notification = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016064100_v3_s5_notification_consequences.sql"),
  "utf8",
);

describe("System V3 S9/S10 attempt-level SLI honesty", () => {
  it("is a forward-only local migration contract", () => {
    expect(migration).toContain("'v3.s9-s10.attempt-sli-honesty'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("keeps the prior aggregate implementation internal instead of deleting evidence", () => {
    expect(migration).toContain(
      "rename to admin_system_workflow_observability_snapshot_unfiltered_v3",
    );
    expect(migration).toContain(
      "rename to admin_system_v3_sli_snapshot_unfiltered_v3",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
  });

  it("advertises operation-success ratios only for proven pre-execution S2 boundaries", () => {
    for (const scope of [
      "entry_mutation",
      "media_review_consequence",
      "jury_submission",
      "voting_round_transition",
      "publication",
    ]) {
      expect(migration).toContain(`'${scope}'`);
      expect(workflowSli).toContain(`"${scope}"`);
    }
    expect(migration).toContain("'state', 'partial_workflow_measured'");
    expect(migration).toContain("'authoritative_submission_latency'");
  });

  it("marks completion-only and lifecycle-event scopes unavailable for attempt SLIs", () => {
    for (const scope of [
      "confirmation_submission",
      "televote_submission",
      "results_lifecycle",
      "notification_consequence",
      "projection_reconciliation",
    ]) {
      expect(migration).toContain(`'${scope}'`);
      expect(workflowSli).toContain(`"${scope}"`);
    }
    expect(migration).toContain("'unavailableOperationScopes'");
    expect(migration).toContain("'unavailableReasons'");
  });

  it("grounds the downgrade in the actual current producer semantics", () => {
    expect(confirmation).toContain(
      "if not coalesce((new.result ->> 'ok')::boolean, false) then",
    );
    expect(confirmation).toContain("Successful participant submissions are bridged");
    expect(televote).toContain("after update of submission_id, submitted_at");
    expect(televote).toContain("'televote.submit'");
    expect(notification).toContain("v_command := 'notification.fail'");
    expect(notification).toContain("'succeeded'");
  });

  it("does not weaken classifiers, command authorities or hosted-environment guards", () => {
    expect(migration).not.toContain("create or replace function private.v3_observability_workflow_class");
    expect(migration).not.toContain("create or replace function televoting.submit_vote_checked");
    expect(migration).not.toContain("create or replace function public.v3_submit_confirmation");
    expect(migration).not.toContain("create or replace function public.studio2_execute_result_operation");
  });
});
