import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 scheduler recovery", () => {
  const migration = source(
    "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
  );
  const systemOperations = source(
    "src/routes/_authenticated/admin/system-operations.tsx",
  );

  it("projects failed or inactive Solaris jobs into canonical Organizer Tasks", () => {
    expect(migration).toContain("private.studio2_reconcile_system_job_tasks");
    expect(migration).toContain("'system_job'");
    expect(migration).toContain("'system.job.failure'");
    expect(migration).toContain("'system.manage'");
    expect(migration).toContain("perform private.studio2_reconcile_system_job_tasks()");
    expect(migration).toContain("perform private.studio2_sync_task_notifications(p_edition_id)");
    expect(migration).toContain("perform private.studio2_prune_stale_task_notifications(p_edition_id)");
  });

  it("escalates repeated failure to dead-letter attention without inventing a second scheduler", () => {
    expect(migration).toContain("consecutive_failures");
    expect(migration).toContain(">= 3");
    expect(migration).toContain("'deadLettered'");
    expect(migration).toContain("'scheduled_retry_dead_letter'");
    expect(migration).toContain("'operator_intervention'");
    expect(systemOperations).toContain("dead-letter");
    expect(systemOperations).toContain("Automatic retry on the next scheduled run");
    expect(systemOperations).toContain("Operator intervention required");
  });

  it("never exposes a generic browser path that executes stored cron SQL", () => {
    const executableSql = migration
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    expect(executableSql).not.toContain("job.command");
    expect(executableSql).not.toContain("execute job.");
    expect(executableSql).not.toContain("admin_retry_solaris_job");
    expect(systemOperations).not.toContain("Run SQL");
    expect(systemOperations).not.toContain("Retry background job");
  });

  it("resolves the failure task only from authoritative scheduler recovery", () => {
    expect(migration).toContain("state = 'resolved'");
    expect(migration).toContain("where source_kind = 'system_job'");
    expect(migration).toContain("last_status");
    expect(migration).toContain("lower(recent.last_status) not in ('success', 'succeeded')");
  });
});
