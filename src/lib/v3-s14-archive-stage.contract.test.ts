import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const archive = readFileSync(".github/scripts/v3-s14-stage-10-archive.sh", "utf8");
const transitionMigration = readFileSync(
  "supabase/migrations/20260916145441_permission_engine_v2_transition_approval_rpc_cutover.sql",
  "utf8",
);
const taskHardening = readFileSync(
  "supabase/migrations/20261003135000_organisation_os_v5_review_hardening.sql",
  "utf8",
);

describe("S14 fail-closed archive certification boundary", () => {
  it("keeps Stage 10 and its projection invariants planned until #678 is real", () => {
    expect(V3_S14_STAGES.find((stage) => stage.id === "stage-10-archive")?.implementationState).toBe("planned");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "tasks-canonical")?.implementationState).toBe("planned");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "notifications-reconcilable")?.implementationState).toBe("planned");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-stage-10-archive.sh"');
    expect(driver).not.toContain("run_s14_stage_10_archive");
  });

  it("refuses to fast-forward the edition runtime and requires the completed chain to reach results first", () => {
    expect(archive).toContain("requires canonical edition runtime state=results");
    expect(archive).not.toContain("submissions -> pre_show");
    expect(archive).not.toContain("rehearsals -> jury_voting");
    expect(transitionMigration).toContain("studio2_transition_edition_v2");
    expect(archive).toContain("results -> post_edition");
    expect(archive).toContain("post_edition -> archived");
  });

  it("requires the missing canonical archive DomainEvent instead of certifying legacy state change alone", () => {
    expect(archive).toContain("edition.state_changed");
    expect(archive).toContain("edition.archived");
    expect(archive).toContain("blocked by #678");
    expect(archive).toContain("private.v3_domain_events");
    expect(transitionMigration).toContain("'edition.state_changed'");
  });

  it("uses canonical task and notification reconcilers and forbids QA cleanup writes", () => {
    expect(taskHardening).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(taskHardening).toContain("private.studio2_prune_stale_task_notifications");
    expect(archive).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(archive).toContain("studio2_organizer_tasks");
    expect(archive).toContain("admin_notifications");
    expect(archive).toContain("notification_deliveries");
    expect(archive).not.toMatch(/delete\s+from\s+public\.studio2_organizer_tasks/i);
    expect(archive).not.toMatch(/update\s+public\.studio2_organizer_tasks/i);
    expect(archive).not.toMatch(/update\s+public\.admin_notifications/i);
    expect(archive).not.toMatch(/delete\s+from\s+public\.notification_deliveries/i);
  });

  it("proves archive cannot destroy immutable results, publication provenance or pre-existing receipts", () => {
    expect(archive).toContain("s14_result_evidence_hash");
    expect(archive).toContain("s14_publication_evidence_hash");
    expect(archive).toContain("assert_receipts_retained");
    expect(archive).toContain("archive mutated immutable result-version history");
    expect(archive).toContain("archive mutated exact publication provenance");
    expect(archive).toContain("archive removed");
    expect(archive).toContain('assert_anonymous_result_matches_version "$FINAL_ID" 2');
  });

  it("only emits formal Stage 10/invariant markers after all fail-closed checks", () => {
    const blocked = archive.indexOf("blocked by #678");
    const taskMarker = archive.indexOf("S14_INVARIANT_TASKS_COMPLETE");
    const notificationMarker = archive.indexOf("S14_INVARIANT_NOTIFICATIONS_COMPLETE");
    const stageMarker = archive.indexOf("S14_STAGE_10_ARCHIVE_COMPLETE");
    expect(blocked).toBeGreaterThan(-1);
    expect(taskMarker).toBeGreaterThan(blocked);
    expect(notificationMarker).toBeGreaterThan(blocked);
    expect(stageMarker).toBeGreaterThan(blocked);
  });

  it("keeps the archive shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-10-archive.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
