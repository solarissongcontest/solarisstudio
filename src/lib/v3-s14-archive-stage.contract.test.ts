import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_S14_FAILURE_INJECTIONS, V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const archive = readFileSync(".github/scripts/v3-s14-stage-10-archive.sh", "utf8");
const archiveMigration = readFileSync(
  "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
  "utf8",
);
const readinessMigration = readFileSync(
  "supabase/migrations/20261019112200_v3_s14_final_results_readiness_hardening.sql",
  "utf8",
);
const transitionConflictMigration = readFileSync(
  "supabase/migrations/20261019112300_v3_s14_transition_http409.sql",
  "utf8",
);
const taskRegistryMigration = readFileSync(
  "supabase/migrations/20261019112400_v3_s14_archive_task_registry_alignment.sql",
  "utf8",
);
const notificationInvariantMigration = readFileSync(
  "supabase/migrations/20261019112500_v3_s14_resolved_task_notification_invariant.sql",
  "utf8",
);
const deliveryReconciliationMigration = readFileSync(
  "supabase/migrations/20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql",
  "utf8",
);
const archiveForwardFixMigration = readFileSync(
  "supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
  "utf8",
);

describe("S14 Stage 10 archive certification against current canonical V3 System authority", () => {
  it("wires merged Stage 10 only after the persistent contest reaches canonical Results", () => {
    expect(V3_S14_STAGES.find((stage) => stage.id === "stage-10-archive")?.implementationState).toBe("implemented");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "tasks-canonical")?.implementationState).toBe("implemented");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "notifications-reconcilable")?.implementationState).toBe("implemented");
    expect(V3_S14_FAILURE_INJECTIONS.find((item) => item.id === "supabase-outage")?.implementationState).toBe("implemented");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-stage-10-archive.sh"');
    expect(driver).toContain("reconcile_edition_runtime_to_results");
    expect(driver).toContain("private.v3_edition_final_results_ready");
    expect(driver).toContain("studio2_transition_edition_v3");
    expect(driver).toContain("S14_RESULTS_RUNTIME_RECONCILIATION_COMPLETE");
    expect(driver).toContain("run_stage stage-10-archive run_s14_stage_10_archive");
    const gfPublication = driver.indexOf("run_contest_extension grand-final-publication");
    const resultsInvocation = driver.lastIndexOf("reconcile_edition_runtime_to_results");
    const archiveInvocation = driver.indexOf("run_stage stage-10-archive run_s14_stage_10_archive");
    expect(gfPublication).toBeGreaterThan(-1);
    expect(resultsInvocation).toBeGreaterThan(gfPublication);
    expect(archiveInvocation).toBeGreaterThan(resultsInvocation);
  });

  it("tracks the complete current Archive migration chain instead of stale pre-convergence filenames", () => {
    expect(archiveMigration).toContain("v3.s14.archive-consequence-reconciliation");
    expect(readinessMigration).toContain("v3.s14.final-results-readiness-hardening");
    expect(transitionConflictMigration).toContain("v3.s14.transition-http409");
    expect(taskRegistryMigration).toContain("v3.s14.archive-task-registry-alignment");
    expect(notificationInvariantMigration).toContain("v3.s14.resolved-task-notification-invariant");
    expect(deliveryReconciliationMigration).toContain("v3.s14.resolved-task-delivery-reconciliation");
    expect(archiveForwardFixMigration).toContain("v3.s14.archive-invariant-forward-fixes");
  });

  it("uses the single V3 lifecycle authority with CAS plus stable operation identity", () => {
    expect(archiveMigration).toContain("public.studio2_transition_edition_v3");
    expect(archiveMigration).toContain("p_expected_version bigint");
    expect(archiveMigration).toContain("p_operation_id uuid");
    expect(archiveMigration).toContain("p_idempotency_key text");
    expect(archive).toContain("studio2_transition_edition_v3");
    expect(archive).toContain("p_expected_version");
    expect(archive).toContain("S14_POST_EDITION_OPERATION_ID");
    expect(archive).toContain("S14_ARCHIVE_OPERATION_ID");
    expect(archive).not.toContain("studio2_transition_edition_v2");
  });

  it("refuses Archive unless the completed contest is honestly at Results with exact public result provenance", () => {
    expect(archive).toContain("requires canonical edition runtime state=results");
    expect(archive).toContain("result_row_count>0");
    expect(archive).toContain("source_result_version=(case show_id");
    expect(archive).toContain("private.v3_edition_final_results_ready");
    expect(archive).toContain("studio2_normalise_publication_config(frozen_config)");
    expect(readinessMigration).toContain("private.v3_edition_final_results_ready");
    expect(readinessMigration).toContain("v3_publication_result_version_release_ready");
    expect(readinessMigration).toContain("control.source_result_version");
  });

  it("proves Archive cannot bypass, reverse, or delete the canonical runtime fact", () => {
    expect(archiveForwardFixMigration).toContain("private.v3_guard_archive_runtime_transition");
    expect(archiveForwardFixMigration).toContain("tg_op = 'DELETE'");
    expect(archiveForwardFixMigration).toContain("v3_guard_archive_runtime_delete");
    expect(archiveForwardFixMigration).toContain("Archived edition runtime is irreversible.");
    expect(archiveForwardFixMigration).toContain("Archive transition must use the canonical V3 lifecycle command.");
    expect(archiveForwardFixMigration).toContain("solaris.v3_archive_command");
    expect(archive).toContain("direct database write bypassed the canonical Archive command guard");
    expect(archive).toContain("rejected direct Archive attempt changed canonical runtime state");
    expect(archive).toContain("archived edition runtime was reversible through a direct database write");
    expect(archive).toContain("rejected Archive reversal changed canonical runtime state");
    expect(archive).toContain("service-role archived runtime deletion unexpectedly succeeded");
    expect(archive).toContain("archived runtime deletion did not fail through the canonical guard");
    expect(archive).toContain("archived runtime fact was deleted or changed");
  });

  it("proves durable replay and reconciliation instead of accepting an ambiguous archive response", () => {
    expect(archive).toContain("archive_expected_version");
    expect(archive).toContain("replay exact archive operation");
    expect(archive).toContain("archive exact retry replays durable receipt");
    expect(archive).toContain("studio2_reconcile_operation");
    expect(archive).toContain('expect_json "Archive recovered operation" operationId "$S14_ARCHIVE_OPERATION_ID"');
    expect(archive).toContain('expect_json "Archive recovered status" status succeeded');
    expect(archiveMigration).toContain("studio2_claim_operation");
    expect(archiveMigration).toContain("'replayed', true");
    expect(transitionConflictMigration).toContain("PT409");
  });

  it("requires one canonical Archive DomainEvent and consumes its edition.tasks consequence", () => {
    expect(archiveMigration).toContain("'edition.archived'");
    expect(archiveMigration).toContain("array['edition.tasks']::text[]");
    expect(archive).toContain("event_type='edition.archived'");
    expect(archive).toContain("consumer_key='edition.tasks'");
    expect(archive).toContain("studio2_claim_domain_event_deliveries");
    expect(archive).toContain("studio2_process_edition_domain_event");
    expect(archive).toContain("v3_domain_event_consumer_receipts");
    expect(archive).toContain("lifecycleAuthority");
    expect(archive).toContain("studio2_edition_runtime");
  });

  it("uses the System-owned archived-task vocabulary and explicitly covers canonical edition.blocker", () => {
    expect(taskRegistryMigration).toContain("private.v3_archive_task_type_is_current_workflow");
    expect(taskRegistryMigration).toContain("= 'edition.blocker'");
    expect(taskRegistryMigration).toContain("private.v3_guard_archived_edition_task_resurrection");
    expect(archiveForwardFixMigration).toContain("private.v3_guard_archived_edition_task_resurrection");
    expect(archive).toContain("private.v3_archive_task_type_is_current_workflow(task.task_type)");
    expect(archive).toContain("task.task_type='edition.blocker'");
    expect(archive).toContain("unresolved canonical edition.blocker tasks");
    expect(archive).not.toMatch(/delete\s+from\s+public\.studio2_organizer_tasks/i);
    expect(archive).not.toMatch(/update\s+public\.studio2_organizer_tasks/i);
  });

  it("requires resolved-task Inbox and delivery state to reconcile without rewriting resolution history", () => {
    expect(notificationInvariantMigration).toContain("task.state <> 'resolved'");
    expect(notificationInvariantMigration).toContain("requires_action = false");
    expect(notificationInvariantMigration).toContain("private.v3_project_resolved_task_delivery_state");
    expect(deliveryReconciliationMigration).toContain("private.v3_reconcile_resolved_task_notifications");
    expect(deliveryReconciliationMigration).toContain("delivery.status in ('pending', 'processing')");
    expect(deliveryReconciliationMigration).not.toContain("delivery.status in ('pending', 'processing', 'failed')");
    expect(deliveryReconciliationMigration).toContain("Failed attempts are immutable failure evidence");
    expect(deliveryReconciliationMigration).toContain("status = 'suppressed'");
    expect(archiveForwardFixMigration).toContain("coalesce(old.resolved_at, new.resolved_at, now())");
    expect(archiveForwardFixMigration).toContain("private.studio2_prune_stale_task_notifications");
    expect(archive).toContain("s14_resolved_task_evidence_hash");
    expect(archive).toContain("private.v3_reconcile_resolved_task_notifications");
    expect(archive).toContain("resolved-task delivery reconciliation rewrote historical task resolution evidence");
    expect(archive).toContain("admin_notifications");
    expect(archive).toContain("notification_deliveries");
    expect(archive).toContain("task.state='resolved'");
    expect(archive).toContain("resolved-task notifications still claiming action");
    expect(archive).toContain("delivery.status in ('pending','processing')");
    expect(archive).toContain("deliverable notifications for resolved Organizer tasks");
    expect(archive).not.toContain("delivery.status in ('pending','processing','failed')");
    expect(archive).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
    expect(archive).not.toMatch(/update\s+public\.admin_notifications/i);
  });

  it("fails closed on a client-visible local Supabase API outage without inventing success", () => {
    expect(archive).toContain("run_s14_supabase_outage_injection");
    expect(archive).toContain("http://127.0.0.1:1");
    expect(archive).toContain("--connect-timeout 1");
    expect(archive).toContain("--max-time 2");
    expect(archive).toContain("simulated Supabase outage unexpectedly produced transport success");
    expect(archive).toContain("client-visible Supabase outage changed authoritative archived state");
    expect(archive).toContain("client-visible Supabase outage fabricated or lost Archive operation truth");
    expect(archive).toContain("S14_FAILURE_SUPABASE_OUTAGE_COMPLETE");
    expect(archive).not.toMatch(/https?:\/\/[^\s'"]*supabase\.co/i);
  });

  it("preserves canonical lifecycle authority while projecting a terminal compatibility status for legacy public readers", () => {
    expect(archiveForwardFixMigration).toContain("private.v3_sync_archived_edition_legacy_status");
    expect(archiveForwardFixMigration).toContain("set status = 'completed'");
    expect(archiveForwardFixMigration).toContain("private.v3_guard_archived_legacy_edition_status");
    expect(archive).toContain("legacy public lifecycle compatibility projection did not become terminal");
    expect(archive).not.toContain("legacy_status_before");
    expect(archive).toContain("s14_result_evidence_hash");
    expect(archive).toContain("s14_publication_evidence_hash");
    expect(archive).toContain("assert_receipts_retained");
    expect(archive).toContain("archive mutated immutable result-version history");
    expect(archive).toContain("archive mutated exact publication provenance");
    expect(archive).toContain('assert_anonymous_result_matches_version "$FINAL_ID" "$FINAL_RESULT_VERSION"');
    expect(archiveMigration).toContain("public.editions.status");
  });

  it("only emits formal Stage 10 and projection markers after consequence, reconciliation, history and outage checks", () => {
    const consume = archive.indexOf("studio2_process_edition_domain_event");
    const reconciliation = archive.indexOf("resolved-task delivery reconciliation rewrote historical task resolution evidence");
    const blocker = archive.indexOf("unresolved canonical edition.blocker tasks");
    const immutable = archive.indexOf("archive mutated immutable result-version history");
    const outage = archive.lastIndexOf("run_s14_supabase_outage_injection");
    const outageMarker = archive.indexOf("S14_FAILURE_SUPABASE_OUTAGE_COMPLETE");
    const taskMarker = archive.indexOf("S14_INVARIANT_TASKS_COMPLETE");
    const notificationMarker = archive.indexOf("S14_INVARIANT_NOTIFICATIONS_COMPLETE");
    const stageMarker = archive.indexOf("S14_STAGE_10_ARCHIVE_COMPLETE");

    expect(consume).toBeGreaterThan(-1);
    expect(reconciliation).toBeGreaterThan(consume);
    expect(blocker).toBeGreaterThan(reconciliation);
    expect(immutable).toBeGreaterThan(blocker);
    expect(outage).toBeGreaterThan(immutable);
    expect(outageMarker).toBeGreaterThan(-1);
    expect(taskMarker).toBeGreaterThan(outage);
    expect(notificationMarker).toBeGreaterThan(taskMarker);
    expect(stageMarker).toBeGreaterThan(notificationMarker);
  });

  it("keeps the Archive shell syntactically valid and hosted-Supabase-free", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-10-archive.sh"], { stdio: "pipe" }),
    ).not.toThrow();
    expect(archive).not.toContain("supabase.co");
  });
});
