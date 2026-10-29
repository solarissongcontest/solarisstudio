import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const runtime = source(".github/scripts/v3-s14-lib.sh");
const stage1 = source(".github/scripts/v3-s14-stage-1-setup.sh");
const stage2 = source(".github/scripts/v3-s14-stage-2-onboarding.sh");
const stage3 = source(".github/scripts/v3-s14-stage-3-confirmations.sh");
const stage4 = source(".github/scripts/v3-s14-stage-4-entries.sh");
const stage5 = source(".github/scripts/v3-s14-stage-5-running-orders.sh");
const stage6 = source(".github/scripts/v3-s14-stage-6-jury.sh");
const stage7 = source(".github/scripts/v3-s14-stage-7-public-voting.sh");
const stage7Deadline = source(".github/scripts/v3-s14-stage-7-genuine-deadline.sh");
const stage8 = source(".github/scripts/v3-s14-stage-8-results.sh");
const stage9 = source(".github/scripts/v3-s14-stage-9-publication.sh");
const stage10 = source(".github/scripts/v3-s14-stage-10-archive.sh");
const resultsAdapter = source("scripts/v3-s14-materialize-televote-results.ts");
const readiness = source("scripts/check-v3-s14-rehearsal-readiness.ts");

describe("S14 stateful full-contest harness", () => {
  it("returns only anonymous snapshot JSON when HTTP success is logged", () => {
    const helpers = stage9.slice(0, stage9.indexOf("immutable_result_snapshot()"));
    const success = runtime.slice(runtime.indexOf("expect_success()"), runtime.indexOf("expect_failure()"));
    const script = `
${helpers}
${success}
log() { printf 'PASS: %s\\n' "$*"; }
fail() { exit 1; }
API_URL=http://127.0.0.1:54321
ANON_KEY=local-test
SNAPSHOT_BODY="$1"
request() { HTTP_STATUS=200; HTTP_BODY="$SNAPSHOT_BODY"; }
anonymous_result_snapshot local-show
`;
    for (const payload of [[], [{ id: "current-result", total_points: 12 }]]) {
      const output = execFileSync("bash", ["-c", script, "snapshot-test", JSON.stringify(payload)], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(JSON.parse(output)).toEqual(payload);
    }
  });

  it("models worker death with a legal lease and waits for canonical expiry", () => {
    const claimContract = source("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql");
    const bounds = claimContract.match(/p_lease_seconds not between (\d+) and (\d+)/);
    const lease = stage8.match(/'s14-crash-worker',100,(\d+)/);
    const wait = stage8.match(/sleep (\d+)\n {2}second_claim=/);
    expect(bounds).not.toBeNull();
    expect(lease).not.toBeNull();
    expect(wait).not.toBeNull();
    expect(Number(lease![1])).toBeGreaterThanOrEqual(Number(bounds![1]));
    expect(Number(lease![1])).toBeLessThanOrEqual(Number(bounds![2]));
    expect(Number(wait![1])).toBeGreaterThan(Number(lease![1]));
    expect(stage8).toContain("expired Results lease was not reclaimable after worker crash");
    expect(stage8).toContain("recovered Results delivery has no consumer receipt");
    expect(stage8).not.toMatch(/update\s+private\.v3_domain_event_outbox/i);
  });

  it("keeps one bounded 66-delegation contest instead of copying production", () => {
    expect(V3_S14_SEED_CONTRACT.editionCount).toBe(1);
    expect(V3_S14_SEED_CONTRACT.delegationCount).toBe(66);
    expect(V3_S14_SEED_CONTRACT.deterministic).toBe(true);
    expect(V3_S14_SEED_CONTRACT.bounded).toBe(true);
    expect(stage1).toContain("generate_series(1, 66)");
    expect(stage1).toContain("S14 Full Contest Rehearsal");
    expect(stage1).not.toContain("prod");
    expect(driver).toContain("DATABASE_FINGERPRINT");
    expect(driver).toContain("assert_same_persistent_contest");
    expect(driver).not.toContain("supabase db reset");
  });

  it("runs all lifecycle stages in one process and never substitutes isolated rehearsals", () => {
    for (const path of [
      "v3-s14-stage-1-setup.sh",
      "v3-s14-stage-2-onboarding.sh",
      "v3-s14-stage-3-confirmations.sh",
      "v3-s14-stage-4-entries.sh",
      "v3-s14-stage-5-running-orders.sh",
      "v3-s14-stage-6-jury.sh",
      "v3-s14-stage-7-public-voting.sh",
      "v3-s14-stage-7-genuine-deadline.sh",
      "v3-s14-stage-8-results.sh",
      "v3-s14-stage-9-publication.sh",
      "v3-s14-stage-10-archive.sh",
    ]) expect(driver).toContain(`source "$SCRIPT_DIR/${path}"`);
    expect(driver).not.toContain("v3-confirmation-security-rehearsal.sh");
    expect(driver).not.toContain("v3-entry-receipt-security-rehearsal.sh");
    expect(driver).not.toContain("v3-s5-publication-consequences-rehearsal.sh");
    expect(driver).not.toContain("v3-jury-security-rehearsal.sh");
    expect(driver).not.toContain("v3-s14-televote-deadline-extension-rehearsal.sh");
    expect(driver).not.toContain("v3-s3-results-invariants-rehearsal.sh");
    expect(driver).not.toContain("v3-s3-publication-invariants-rehearsal.sh");
  });

  it("fails closed on production identity and exact candidate mismatch", () => {
    expect(runtime).toContain("check-v3-production-isolation.ts");
    expect(runtime).toContain("refusing S14 against non-local API_URL");
    expect(runtime).toContain("V3_CANDIDATE_SHA");
    expect(runtime).toContain('[[ "$CANDIDATE_SHA" == "$HEAD_SHA" ]]');
    expect(runtime).not.toContain("supabase.co");
  });

  it("implements the connected contest lifecycle through canonical Archive", () => {
    expect(V3_S14_STAGES.every((item) => item.implementationState === "implemented")).toBe(true);
    expect(stage3).toContain("seq 1 66");
    expect(stage3).toContain("v3_submit_confirmation");
    expect(stage3).toContain("v3_reconcile_confirmation");
    expect(stage3).toContain("studio2_apply_confirmation_round_change");
    expect(stage3).toContain("submission_versions");
    expect(stage3).toContain("S14_STAGE_3_CONFIRMATIONS_COMPLETE");
    expect(stage7Deadline).toContain("S14_STAGE_7_PUBLIC_VOTING_COMPLETE");
    expect(stage8).toContain("S14_STAGE_8_RESULTS_COMPLETE");
    expect(stage9).toContain("S14_STAGE_9_PUBLICATION_COMPLETE");
    expect(stage10).toContain("S14_STAGE_10_ARCHIVE_COMPLETE");
    expect(driver).toContain("run_stage stage-10-archive run_s14_stage_10_archive");
  });

  it("makes the canonical persisted deadline extension part of the same Stage 7 contest", () => {
    const publicVoting = V3_S14_STAGES.find((item) => item.id === "stage-7-public-voting");
    expect(publicVoting).toBeDefined();
    expect(publicVoting?.requirements).toContain("deadline extension");
    expect(publicVoting?.implementationState).toBe("implemented");
    expect(publicVoting?.implementationAsset).toBe(".github/scripts/v3-s14-stage-7-genuine-deadline.sh");
    expect(stage7Deadline).toContain("studio2_round_deadline_change_preview");
    expect(stage7Deadline).toContain("studio2_apply_round_deadline_change");
    expect(stage7Deadline).toContain("Voting deadline has passed");
    expect(stage7Deadline).toContain("closes_at + interval '2 minutes'");
    expect(stage7Deadline).toContain("televote.extended");
    expect(stage7Deadline).not.toContain("extension-reopen");
  });

  it("drives Entry review, exact-version reconciliation and Media replacement through canonical authority", () => {
    expect(stage4).toContain("seq 1 64");
    expect(stage4).toContain("v3_submit_confirmation");
    expect(stage4).toContain("studio2_apply_confirmation_entry_review");
    expect(stage4).toContain("studio2_confirmation_review_versions");
    expect(stage4).toContain("VERSION_CONFLICT");
    expect(stage4).toContain("private.v3_entry_versions");
    expect(stage4).toContain("studio2_review_media_assets");
    expect(stage4).toContain("private.v3_media_asset_is_currently_accepted");
    expect(stage4).toContain("media.reviewed");
    expect(stage4).toContain("S14_STAGE_4_ENTRIES_COMPLETE");
  });

  it("uses atomic Organizer running-order primitives and governed publication before anonymous verification", () => {
    expect(stage5).toContain("admin_set_show_allocations");
    expect(stage5).toContain("admin_set_show_running_order");
    expect(stage5).toContain("studio2_apply_show_publication_change");
    expect(stage5).toContain("publication.show.change");
    expect(stage5).toContain("publication.changed");
    expect(stage5).toContain("$API_URL/rest/v1/shows");
    expect(stage5).toContain("$API_URL/rest/v1/participants");
    expect(stage5).toContain("S14_STAGE_5_RUNNING_ORDERS_COMPLETE");
    expect(stage5).not.toContain("v3-s5-publication-consequences-rehearsal.sh");
  });

  it("drives Jury through governed R2 windows, eligibility, CAS drafts, integrity preflight and authoritative receipts", () => {
    expect(stage6).toContain("studio2_jury_window_change_preview");
    expect(stage6).toContain("studio2_apply_jury_voting_status");
    expect(stage6).toContain("public.studio2_operation_receipts");
    expect(stage6).toContain("jury.opened");
    expect(stage6).toContain("jury.closed");
    expect(stage6).not.toContain("rpc_request \"$ORGANIZER_A_TOKEN\" admin_set_jury_voting_status");
    expect(stage6).toContain("v3_save_jury_draft");
    expect(stage6).toContain("server_revision 1");
    expect(stage6).toContain("vote_preflight_checks");
    expect(stage6).toContain("v3_submit_jury_ballot");
    expect(stage6).toContain("receipt.authority authoritative_server");
    expect(stage6).toContain("v3_reconcile_jury_submission");
    expect(stage6).toContain("cannot vote for your own country");
    expect(stage6).toContain("receipt.replayed true");
    expect(stage6).toContain("submitted_total\" == \"64");
    expect(stage6).toContain("S14_INVARIANT_JURY_COMPLETE");
    expect(stage6).toContain("S14_STAGE_6_JURY_COMPLETE");
    expect(stage6).not.toContain("v3-jury-security-rehearsal.sh");
  });

  it("drives Public Voting through canonical ballots, reconciliation, integrity and deadline authority", () => {
    expect(stage7).toContain("submit_vote_checked");
    expect(stage7).toContain("v3_reconcile_televote");
    expect(stage7).toContain("pre_submit_integrity_check");
    expect(stage7).toContain("duplicate public Televote");
    expect(stage7Deadline).toContain("televote.deadline.change");
    expect(stage7Deadline).toContain("studio2_process_televote_domain_event");
    expect(stage7Deadline).toContain("S14_INVARIANT_TELEVOTE_COMPLETE");
  });

  it("resolves incomplete inputs then proves immutable semifinal Results v1 equals canonical v2", () => {
    expect(stage8).toContain("studio2_execute_result_operation");
    expect(stage8).toContain("studio2_jury_dnv_preview");
    expect(stage8).toContain("studio2_apply_jury_dnv");
    expect(stage8).toContain("private.studio2_result_preconditions");
    expect(stage8).toContain("private.v3_result_versions");
    expect(stage8).toContain("mark_reveal_ready");
    expect(stage8).toContain("statement_timeout='150ms'");
    expect(stage8).toContain("studio2_claim_domain_event_deliveries");
    expect(stage8).toContain("studio2_process_results_domain_event");
    expect(stage8).toContain("S14_FAILURE_DB_TIMEOUT_COMPLETE");
    expect(stage8).toContain("S14_FAILURE_WORKER_CRASH_COMPLETE");
    expect(stage8).toContain("S14_INVARIANT_RESULT_COMPLETE");
    expect(stage8).toContain("S14_STAGE_8_RESULTS_COMPLETE");
    expect(stage8).not.toContain("v3-s3-results-invariants-rehearsal.sh");
    expect(driver).toContain("promote_semifinal_results_to_v2");
    expect(driver).toContain('execute_result_action "$show_id" unlock');
    expect(driver).toContain('execute_result_action "$show_id" calculate');
    expect(driver).toContain("v1.result_rows = v2.result_rows");
    expect(driver).toContain("next_version=$((base_version+1))");
    expect(driver).toContain('v1.version=$base_version');
    expect(driver).toContain('v2.version=$next_version');
    expect(driver).toContain('SEMI_ONE_RESULT_VERSION="$next_version"');
    expect(driver).toContain('lifecycle" == "$next_version:$next_version:$next_version:$next_version"');
    expect(driver).toContain("S14_RESULTS_VERSION_2_COMPLETE");
    expect(resultsAdapter).toContain("convertRound");
    expect(resultsAdapter).toContain("refusing non-local Supabase URL");
    expect(resultsAdapter).toContain('from("televote_votes")');
    expect(resultsAdapter).toContain('from("round_results")');
    expect(resultsAdapter).toContain("V3_DESTRUCTIVE_VERIFICATION");
  });

  it("publishes the exact finalized result version and recovers from missed realtime through authoritative refresh", () => {
    expect(stage9).toContain("studio2_show_publication_change_preview");
    expect(stage9).toContain("studio2_apply_show_publication_change");
    expect(stage9).toContain("private.v3_publication_result_version_release_ready");
    expect(stage9).toContain("riskClass R3");
    expect(stage9).toContain("sourceResultVersion");
    expect(stage9).toContain("auth_freshness_evidence");
    expect(stage9).toContain("$API_URL/rest/v1/results");
    expect(stage9).toContain("private.v3_result_versions");
    expect(stage9).toContain("publication.changed");
    expect(stage9).toContain("S14_FAILURE_REALTIME_DISCONNECT_COMPLETE");
    expect(stage9).toContain("S14_INVARIANT_PUBLICATION_COMPLETE");
    expect(stage9).toContain("S14_STAGE_9_PUBLICATION_COMPLETE");
    expect(stage9).not.toContain("v3-s3-publication-invariants-rehearsal.sh");
  });

  it("uses the real notification category vocabulary during onboarding", () => {
    expect(stage2).toContain("'televoting'");
    expect(stage2).not.toContain("'televote'");
  });

  it("marks every canonical failure injection and invariant only after executable proof exists", () => {
    const implementedFailures = V3_S14_FAILURE_INJECTIONS.filter(
      (item) => item.implementationState === "implemented",
    ).map((item) => item.id);
    expect(implementedFailures).toEqual([
      "network-after-commit",
      "db-timeout-before-commit",
      "duplicate-request",
      "worker-crash",
      "realtime-disconnect",
      "stale-client",
      "two-organizers",
      "supabase-outage",
    ]);
    const implementedInvariants = V3_S14_INVARIANTS.filter(
      (item) => item.implementationState === "implemented",
    ).map((item) => item.id);
    expect(implementedInvariants).toEqual([
      "confirmation-no-effective-duplicates",
      "entry-valid-revision",
      "media-accepted-revision",
      "jury-single-final-ballot",
      "televote-canonical-ballot",
      "result-reproducible",
      "publication-final-version",
      "tasks-canonical",
      "notifications-reconcilable",
    ]);
    for (const marker of [
      "S14_FAILURE_NETWORK_AFTER_COMMIT_COMPLETE",
      "S14_FAILURE_DUPLICATE_REQUEST_COMPLETE",
      "S14_FAILURE_STALE_CLIENT_COMPLETE",
      "S14_INVARIANT_CONFIRMATION_COMPLETE",
    ]) expect(stage3).toContain(marker);
    for (const marker of [
      "S14_FAILURE_TWO_ORGANIZERS_COMPLETE",
      "S14_INVARIANT_ENTRY_COMPLETE",
      "S14_INVARIANT_MEDIA_COMPLETE",
    ]) expect(stage4).toContain(marker);
    expect(stage6).toContain("S14_INVARIANT_JURY_COMPLETE");
    expect(stage7Deadline).toContain("S14_INVARIANT_TELEVOTE_COMPLETE");
    expect(stage8).toContain("S14_FAILURE_DB_TIMEOUT_COMPLETE");
    expect(stage8).toContain("S14_FAILURE_WORKER_CRASH_COMPLETE");
    expect(stage8).toContain("S14_INVARIANT_RESULT_COMPLETE");
    expect(stage9).toContain("S14_FAILURE_REALTIME_DISCONNECT_COMPLETE");
    expect(stage9).toContain("S14_INVARIANT_PUBLICATION_COMPLETE");
    expect(stage10).toContain("S14_FAILURE_SUPABASE_OUTAGE_COMPLETE");
    expect(stage10).toContain("S14_INVARIANT_TASKS_COMPLETE");
    expect(stage10).toContain("S14_INVARIANT_NOTIFICATIONS_COMPLETE");
  });

  it("reconciles final publication to canonical Results before Archive with durable replay", () => {
    expect(driver).toContain("S14_RESULTS_RECONCILE_OPERATION_ID");
    expect(driver).toContain("S14_RESULTS_RECONCILE_IDEMPOTENCY_KEY");
    expect(driver).toContain("private.v3_edition_final_results_ready");
    expect(driver).toContain("studio2_transition_edition_v3");
    expect(driver).toContain('p_to\\":\\"results');
    expect(driver).toContain("replay exact S14 Results reconciliation");
    expect(driver).toContain("studio2_reconcile_operation");
    expect(driver).toContain("S14_RESULTS_RUNTIME_RECONCILIATION_COMPLETE");
    const gfPublication = driver.indexOf("run_contest_extension grand-final-publication");
    const resultsInvocation = driver.lastIndexOf("reconcile_edition_runtime_to_results");
    const archiveInvocation = driver.indexOf("run_stage stage-10-archive run_s14_stage_10_archive");
    expect(gfPublication).toBeGreaterThan(-1);
    expect(resultsInvocation).toBeGreaterThan(gfPublication);
    expect(archiveInvocation).toBeGreaterThan(resultsInvocation);
  });

  it("emits release-grade exact-SHA evidence only after the same contest is archived", () => {
    expect(driver).toContain('FINAL_PATH="$OUTPUT_DIR/s14-full-contest.json"');
    expect(driver).toContain('"passed": True');
    expect(driver).toContain('"partial": False');
    expect(driver).toContain('"runtimeFailure": False');
    expect(driver).toContain('"pendingStages": []');
    expect(driver).toContain('"pendingContestExtensions": []');
    expect(driver).toContain('"blockedContestExtensions": []');
    expect(driver).toContain("runIdentity");
    expect(driver).toContain("databaseFingerprint");
    expect(driver).toContain("resultEvidenceHash");
    expect(driver).toContain("publicationEvidenceHash");
    expect(driver).toContain('"finalState": "archived"');
    expect(driver).toContain("write_final_evidence");
    expect(driver).toContain("release-grade S14 evidence requires canonical archived state");
    expect(readiness).not.toContain("Stage 10 remains pending");
  });

  it("keeps every shell module syntactically valid", () => {
    for (const path of [
      ".github/scripts/v3-full-contest-rehearsal.sh",
      ".github/scripts/v3-s14-lib.sh",
      ".github/scripts/v3-s14-stage-1-setup.sh",
      ".github/scripts/v3-s14-stage-2-onboarding.sh",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
      ".github/scripts/v3-s14-stage-4-entries.sh",
      ".github/scripts/v3-s14-stage-5-running-orders.sh",
      ".github/scripts/v3-s14-stage-6-jury.sh",
      ".github/scripts/v3-s14-stage-7-public-voting.sh",
      ".github/scripts/v3-s14-stage-7-genuine-deadline.sh",
      ".github/scripts/v3-s14-stage-8-results.sh",
      ".github/scripts/v3-s14-stage-9-publication.sh",
      ".github/scripts/v3-s14-stage-10-archive.sh",
    ]) {
      expect(() => execFileSync("bash", ["-n", path], { stdio: "pipe" })).not.toThrow();
    }
  });
});