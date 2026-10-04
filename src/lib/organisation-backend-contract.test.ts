import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261004221500_runtime_release_contract.sql",
);
const client = source("src/lib/organisation-backend-contract.ts");
const tasks = source("src/routes/_authenticated/admin/tasks.tsx");
const systemOperations = source(
  "src/routes/_authenticated/admin/system-operations.tsx",
);
const jury = source("src/components/admin/JuryVotingWindowControl.tsx");

describe("Organizer frontend/database compatibility contract", () => {
  it("publishes exact capability truth from the database", () => {
    expect(migration).toContain("function public.studio2_runtime_contract()");

    expect(migration).toContain(
      "to_regprocedure('public.admin_organizer_tasks(uuid,text)')",
    );
    expect(migration).toContain(
      "to_regprocedure('public.admin_organizer_task_count(uuid)')",
    );
    expect(migration).toContain("to_regclass('public.studio2_organizer_tasks')");

    expect(migration).toContain(
      "to_regprocedure('public.admin_system_runtime_health(integer)')",
    );
    expect(migration).toContain(
      "public.admin_retry_failed_notification_delivery(uuid,uuid,text)",
    );
    expect(migration).toContain("provider_accepted_at");
    expect(migration).toContain("received_at");
    expect(migration).toContain("displayed_at");
    expect(migration).toContain("receipt_token_hash");

    expect(migration).toContain(
      "public.studio2_jury_window_change_preview(uuid,text)",
    );
    expect(migration).toContain(
      "public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)",
    );
    expect(migration).toContain("to_regclass('public.studio2_jury_window_versions')");
  });

  it("does not use loose function-name checks that can accept stale overloads", () => {
    expect(migration).not.toContain("p.proname = 'admin_organizer_tasks'");
    expect(migration).not.toContain("p.proname = 'admin_system_runtime_health'");
    expect(migration).not.toContain("p.proname = 'studio2_jury_window_change_preview'");
    expect(migration).not.toContain("p.proname = 'studio2_apply_jury_voting_status'");
  });

  it("treats an absent contract as incompatible instead of optimistic", () => {
    expect(client).toContain("available: false");
    expect(client).toContain("organizerTasks: false");
    expect(client).toContain("systemOperations: false");
    expect(client).toContain("juryWindowOperations: false");
    expect(client).toContain("retry: false");
  });

  it("gates the known V5 failure surfaces", () => {
    expect(tasks).toContain("tasksSupported");
    expect(tasks).toContain("Organizer Tasks backend update required");
    expect(systemOperations).toContain("systemOperationsSupported");
    expect(systemOperations).toContain("System Operations backend update required");
    expect(systemOperations).toContain("if (systemOperationsSupported) void health.refetch()");
    expect(systemOperations).toContain("!systemOperationsSupported ||");
    expect(systemOperations).toContain("if (!systemOperationsSupported) return");
    expect(jury).toContain("juryOperationsSupported");
    expect(jury).toContain("will not fall back to the unsafe legacy mutation path");
  });
});
