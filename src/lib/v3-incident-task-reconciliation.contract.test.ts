import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019221430_v3_incident_task_reconciliation.sql",
  ),
  "utf8",
);
const taskEngine = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
  ),
  "utf8",
);

describe("V3 Incident task reconciliation", () => {
  it("refreshes canonical incident-response tasks after every Incident write", () => {
    expect(migration).toContain("'v3.s7.incident-task-reconciliation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "perform private.studio2_reconcile_all_organizer_tasks(new.edition_id)",
    );
    expect(migration).toContain("after insert or update on public.studio2_incidents");
  });

  it("reuses the existing idempotent task engine instead of creating task truth in the command", () => {
    expect(taskEngine).toContain("task.source_kind = 'incident'");
    expect(taskEngine).toContain("'incident.response'");
    expect(taskEngine).toContain("on conflict (source_key) do update");
    expect(migration).not.toContain("insert into public.studio2_organizer_tasks");
  });
});
