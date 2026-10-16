import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const archive = source(".github/scripts/v3-s14-stage-10-archive.sh");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const gate = source("scripts/check-v3-s14-archive-contract.ts");
const readiness = source("scripts/check-v3-s14-rehearsal-readiness.ts");

describe("S14 Archive foundation", () => {
  it("requires the System-owned edition transition to become versioned, idempotent and reconcilable", () => {
    expect(gate).toContain("expected-runtime-version");
    expect(gate).toContain("stable-operation-identity");
    expect(gate).toContain("stable-idempotency-key");
    expect(gate).toContain("server-operation-ledger");
    expect(gate).toContain("transport-reconciliation");
    expect(gate).toContain("p_expected_version");
    expect(gate).toContain("p_operation_id");
    expect(gate).toContain("p_idempotency_key");
    expect(gate).toContain("studio2_claim_operation");
    expect(gate).toContain("studio2_complete_operation");
    expect(gate).toContain("studio2_reconcile_operation");
  });

  it("fails closed instead of falling back to the legacy edition transition", () => {
    expect(archive).toContain("check-v3-s14-archive-contract.ts --json");
    expect(archive).toContain("S14_ARCHIVE_TRANSITION_BLOCKED");
    expect(archive).toContain("Refusing to fall back to studio2_transition_edition_v2");
    expect(archive).not.toContain("rpc_request \"$ORGANIZER_A_TOKEN\" studio2_transition_edition_v2");
    expect(archive).not.toContain("S14_STAGE_10_ARCHIVE_COMPLETE");
  });

  it("reconciles task and notification projections twice and rejects impossible actionable delivery state", () => {
    expect(archive).toContain("studio2_reconcile_all_organizer_tasks");
    expect(archive).toContain("studio2_sync_task_notifications");
    expect(archive).toContain("studio2_prune_stale_task_notifications");
    expect(archive).toContain("task_digest_before");
    expect(archive).toContain("task_digest_after");
    expect(archive).toContain("actionable Organizer notifications contradict canonical Task state/route");
    expect(archive).toContain("pending Organizer push deliveries are stale or point at impossible actions");
    expect(archive).toContain("S14_ARCHIVE_PREFLIGHT_TASKS_NOTIFICATIONS_STABLE");
  });

  it("preserves immutable/public history and durable receipts before the final lifecycle transition", () => {
    expect(archive).toContain("private.v3_result_versions");
    expect(archive).toContain("source_result_version");
    expect(archive).toContain("studio2_operation_receipts");
    expect(archive).toContain("archive_public_result_count");
    expect(archive).toContain("S14_ARCHIVE_PREFLIGHT_HISTORY_RETAINED");
  });

  it("injects an unreachable local Supabase endpoint and proves authoritative recovery without fake success", () => {
    expect(archive).toContain("http://127.0.0.1:1/rest/v1/editions");
    expect(archive).toContain("--connect-timeout 1");
    expect(archive).toContain("--max-time 1");
    expect(archive).toContain("simulated Supabase outage unexpectedly returned success");
    expect(archive).toContain("authoritative recovery after simulated Supabase outage");
    expect(archive).toContain("S14_ARCHIVE_PREFLIGHT_OUTAGE_RECOVERY_PROVEN");
  });

  it("runs the Archive preflight in the one-process harness but still reports Stage 10 pending", () => {
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-stage-10-archive.sh"');
    expect(driver).toContain("run_s14_stage_10_archive_preflight");
    expect(driver).toContain("stage-10-archive");
    expect(driver).toContain("transitionContractReady");
    expect(driver).not.toContain("S14_STAGE_10_ARCHIVE_COMPLETE");
    expect(readiness).toContain("archiveTransitionContract");
    expect(readiness).toContain("S14 Archive transition is blocked");
  });

  it("keeps the Archive shell module syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-10-archive.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
