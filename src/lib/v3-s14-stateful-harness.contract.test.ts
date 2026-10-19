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
const readiness = source("scripts/check-v3-s14-rehearsal-readiness.ts");

describe("S14 stateful full-contest harness", () => {
  it("keeps one bounded 66-delegation contest instead of copying production", () => {
    expect(V3_S14_SEED_CONTRACT.editionCount).toBe(1);
    expect(V3_S14_SEED_CONTRACT.delegationCount).toBe(66);
    expect(V3_S14_SEED_CONTRACT.deterministic).toBe(true);
    expect(V3_S14_SEED_CONTRACT.bounded).toBe(true);
    expect(stage1).toContain("generate_series(1, 66)");
    expect(stage1).toContain("S14 Full Contest Rehearsal");
    expect(stage1).not.toContain("prod");
  });

  it("runs implemented stages in one process and never substitutes isolated rehearsals", () => {
    for (const path of [
      "v3-s14-stage-1-setup.sh",
      "v3-s14-stage-2-onboarding.sh",
      "v3-s14-stage-3-confirmations.sh",
      "v3-s14-stage-4-entries.sh",
      "v3-s14-stage-5-running-orders.sh",
      "v3-s14-stage-6-jury.sh",
      "v3-s14-stage-7-public-voting.sh",
      "v3-s14-stage-7-genuine-deadline.sh",
    ]) expect(driver).toContain(`source "$SCRIPT_DIR/${path}"`);
    expect(driver).not.toContain("v3-confirmation-security-rehearsal.sh");
    expect(driver).not.toContain("v3-entry-receipt-security-rehearsal.sh");
    expect(driver).not.toContain("v3-s5-publication-consequences-rehearsal.sh");
    expect(driver).not.toContain("v3-jury-security-rehearsal.sh");
    expect(driver).not.toContain("v3-s14-televote-deadline-extension-rehearsal.sh");
    expect(driver).not.toContain("supabase db reset");
  });

  it("fails closed on production identity and exact candidate mismatch", () => {
    expect(runtime).toContain("check-v3-production-isolation.ts");
    expect(runtime).toContain("refusing S14 against non-local API_URL");
    expect(runtime).toContain("V3_CANDIDATE_SHA");
    expect(runtime).toContain('[[ "$CANDIDATE_SHA" == "$HEAD_SHA" ]]');
    expect(runtime).not.toContain("supabase.co");
  });

  it("implements the connected contest lifecycle through Public Voting without claiming later stages", () => {
    expect(V3_S14_STAGES.slice(0, 7).every((item) => item.implementationState === "implemented")).toBe(true);
    expect(V3_S14_STAGES.slice(7).every((item) => item.implementationState === "planned")).toBe(true);
    expect(stage3).toContain("seq 1 66");
    expect(stage3).toContain("v3_submit_confirmation");
    expect(stage3).toContain("v3_reconcile_confirmation");
    expect(stage3).toContain("studio2_apply_confirmation_round_change");
    expect(stage3).toContain("submission_versions");
    expect(stage3).toContain("S14_STAGE_3_CONFIRMATIONS_COMPLETE");
    expect(stage7Deadline).toContain("S14_STAGE_7_PUBLIC_VOTING_COMPLETE");
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

  it("uses the real notification category vocabulary during onboarding", () => {
    expect(stage2).toContain("'televoting'");
    expect(stage2).not.toContain("'televote'");
  });

  it("only marks failure injections and invariants that executable stages prove", () => {
    const implementedFailures = V3_S14_FAILURE_INJECTIONS.filter(
      (item) => item.implementationState === "implemented",
    ).map((item) => item.id);
    expect(implementedFailures).toEqual([
      "network-after-commit",
      "duplicate-request",
      "stale-client",
      "two-organizers",
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
  });

  it("cannot emit release-grade evidence while Stages 8-10 remain pending", () => {
    expect(driver).toContain('"passed": False');
    expect(driver).toContain("s14-full-contest.partial.json");
    expect(driver).toContain('"stage-7-public-voting",');
    expect(driver).toContain("stage-8-results");
    expect(driver).toContain("stage-9-publication");
    expect(driver).toContain("stage-10-archive");
    expect(driver).toContain("passed through Stage 7");
    expect(driver).toContain("No release-grade s14-full-contest.json was written");
    expect(driver).not.toContain('"passed": True');
    expect(readiness).toContain("S14 lifecycle stages not implemented in the unified stateful driver");
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
    ]) {
      expect(() => execFileSync("bash", ["-n", path], { stdio: "pipe" })).not.toThrow();
    }
  });
});