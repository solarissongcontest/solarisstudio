import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const archive = readFileSync(".github/scripts/v3-s14-stage-10-archive-v3.sh", "utf8");

describe("S14 Stage 10 canonical V3 Archive verifier", () => {
  it("requires retained immutable final-publication truth before lifecycle reconciliation", () => {
    expect(archive).toContain("non-empty immutable result version 2 for all three shows");
    expect(archive).toContain("source_result_version=2");
    expect(archive).toContain("reconcile final publication to canonical edition results");
    expect(archive).toContain("reconciledFromFinalPublication");
    expect(archive).not.toContain("submissions -> pre_show");
    expect(archive).not.toContain("for state in");
  });

  it("uses one V3 lifecycle writer for results reconciliation, post-edition and Archive", () => {
    const calls = archive.match(/studio2_transition_edition_v3/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(archive).toContain("transition S14 edition results -> post_edition through V3");
    expect(archive).toContain('"p_to":"results"');
    expect(archive).toContain('"p_to":"post_edition"');
    expect(archive).toContain('"p_to":"archived"');
    expect(archive).not.toContain("studio2_archive_edition_v3");
  });

  it("uses legacy V2 only as a negative Archive bypass probe", () => {
    const v2Calls = archive.match(/studio2_transition_edition_v2/g) ?? [];
    expect(v2Calls).toHaveLength(1);
    expect(archive).toContain("legacy v2 archive bypass");
    expect(archive).toContain('expect_failure "legacy v2 archive bypass"');
    expect(archive).toContain("legacy archive bypass changed canonical runtime");
  });

  it("binds every V3 transition to caller-owned version and operation identity", () => {
    expect(archive).toContain("p_expected_version");
    expect(archive).toContain("p_operation_id");
    expect(archive).toContain("p_idempotency_key");
    expect(archive).toContain("s14-stage10-final-publication-results-v3");
    expect(archive).toContain("s14-stage10-post-edition-v3");
    expect(archive).toContain("s14-stage10-archive-v3");
    expect(archive).toContain("command='edition.transition'");
  });

  it("proves exact replay and semantic-idempotency conflict without a second Archive mutation", () => {
    expect(archive).toContain("canonical V3 archive lost-response replay");
    expect(archive).toContain('expect_json "archive exact retry is marked replayed" replayed true');
    expect(archive).toContain("archive replay mutated runtime twice");
    expect(archive).toContain("archive semantic idempotency conflict");
    expect(archive).toContain("semantic idempotency conflict changed archived runtime");
  });

  it("requires one canonical Archive DomainEvent and actual edition.tasks outbox consumption", () => {
    expect(archive).toContain("event_type='edition.archived'");
    expect(archive).toContain("aggregate_version=$archived_version");
    expect(archive).toContain("payload->>'lifecycleAuthority'");
    expect(archive).toContain("studio2_edition_runtime");
    expect(archive).toContain("studio2_claim_domain_event_deliveries");
    expect(archive).toContain("studio2_process_edition_domain_event");
    expect(archive).toContain("v3_domain_event_consumer_receipts");
    expect(archive).not.toContain("select private.studio2_reconcile_all_organizer_tasks");
  });

  it("uses corrected dead-task semantics rather than deleting all historical work", () => {
    expect(archive).toContain("task.state<>'resolved'");
    expect(archive).toContain(
      "confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast",
    );
    expect(archive).toContain("resolved-task notifications still claiming action");
    expect(archive).toContain("deliverable notifications for resolved Organizer tasks");
    expect(archive).not.toContain("delete from public.studio2_organizer_tasks");
    expect(archive).not.toContain("delete from public.admin_notifications");
  });

  it("keeps legacy edition status out of canonical lifecycle authority", () => {
    expect(archive).toContain("archive incorrectly rewrote legacy editions.status into lifecycle authority");
    expect(archive).toContain('select status from public.editions');
  });

  it("preserves immutable result, publication and receipt history through Archive", () => {
    expect(archive).toContain("archive mutated immutable result-version history");
    expect(archive).toContain("archive mutated exact publication provenance");
    expect(archive).toContain("assert_receipts_retained");
    expect(archive).toContain('assert_anonymous_result_matches_version "$FINAL_ID" 2');
  });

  it("remains unwired until the System Archive authority lands on main", () => {
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-stage-10-archive-v3.sh"');
    expect(driver).not.toContain("run_s14_stage_10_archive_v3");
    expect(archive).toContain("S14_STAGE_10_ARCHIVE_COMPLETE");
  });

  it("keeps the prepared archive verifier syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-10-archive-v3.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
