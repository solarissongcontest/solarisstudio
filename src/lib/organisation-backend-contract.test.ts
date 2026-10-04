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
  it("publishes explicit capability truth from the database", () => {
    expect(migration).toContain("function public.studio2_runtime_contract()");
    expect(migration).toContain("admin_organizer_tasks");
    expect(migration).toContain("admin_system_runtime_health");
    expect(migration).toContain("studio2_jury_window_change_preview");
    expect(migration).toContain("studio2_apply_jury_voting_status");
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
    expect(jury).toContain("juryOperationsSupported");
    expect(jury).toContain("will not fall back to the unsafe legacy mutation path");
  });
});
