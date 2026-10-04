import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const coreMigration = source(
  "supabase/migrations/20261004221500_runtime_release_contract.sql",
);
const completeMigration = source(
  "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
);
const client = source("src/lib/organisation-backend-contract.ts");
const tasks = source("src/routes/_authenticated/admin/tasks.tsx");
const systemOperations = source(
  "src/routes/_authenticated/admin/system-operations.tsx",
);
const jury = source("src/components/admin/JuryVotingWindowControl.tsx");

describe("Organizer frontend/database compatibility contract", () => {
  it("keeps the early database contract intentionally fail-closed", () => {
    expect(coreMigration).toContain("function public.studio2_runtime_contract()");
    expect(coreMigration).toContain("organisation-os-v5-20261004-core");
    expect(coreMigration).toContain("'ready', false");
  });

  it("publishes exact capability truth only from the complete database migration", () => {
    expect(completeMigration).toContain("function public.studio2_runtime_contract()");
    expect(completeMigration).toContain("organisation-os-v5-20261004-complete");

    expect(completeMigration).toContain(
      "to_regprocedure('public.admin_organizer_tasks(uuid,text)')",
    );
    expect(completeMigration).toContain(
      "to_regprocedure('public.admin_organizer_task_count(uuid)')",
    );
    expect(completeMigration).toContain("to_regclass('public.studio2_organizer_tasks')");
    expect(completeMigration).toContain(
      "private.studio2_reconcile_confirmation_sync_tasks()",
    );
    expect(completeMigration).toContain(
      "private.studio2_reconcile_system_job_tasks()",
    );
    expect(completeMigration).toContain(
      "private.studio2_reconcile_jury_ballot_review_tasks(uuid)",
    );

    expect(completeMigration).toContain(
      "to_regprocedure('public.admin_system_runtime_health(integer)')",
    );
    expect(completeMigration).toContain(
      "public.admin_retry_failed_notification_delivery(uuid,uuid,text)",
    );
    expect(completeMigration).toContain("provider_accepted_at");
    expect(completeMigration).toContain("received_at");
    expect(completeMigration).toContain("displayed_at");
    expect(completeMigration).toContain("receipt_token_hash");

    expect(completeMigration).toContain(
      "public.studio2_jury_window_change_preview(uuid,text)",
    );
    expect(completeMigration).toContain(
      "public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)",
    );
    expect(completeMigration).toContain(
      "to_regclass('public.studio2_jury_window_versions')",
    );
  });

  it("does not use loose function-name checks that can accept stale overloads", () => {
    expect(completeMigration).not.toContain("p.proname = 'admin_organizer_tasks'");
    expect(completeMigration).not.toContain("p.proname = 'admin_system_runtime_health'");
    expect(completeMigration).not.toContain("p.proname = 'studio2_jury_window_change_preview'");
    expect(completeMigration).not.toContain("p.proname = 'studio2_apply_jury_voting_status'");
  });

  it("treats an absent, core-only or unknown contract as incompatible instead of optimistic", () => {
    expect(client).toContain("available: false");
    expect(client).toContain("SUPPORTED_SCHEMA_IDS");
    expect(client).toContain('"organisation-os-v5-20261004-complete"');
    expect(client).not.toContain('"organisation-os-v5-20261004-core",');
    expect(client).toContain("Unsupported Organizer runtime contract");
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
