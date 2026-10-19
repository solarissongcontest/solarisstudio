import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019112400_v3_s14_archive_task_registry_alignment.sql",
  ),
  "utf8",
);
const guardRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-archive-guard-rehearsal.sh"),
  "utf8",
);

describe("System V3 S14 archived Edition task vocabulary", () => {
  it("adopts the S13 forward-fix contract", () => {
    expect(migration).toContain("'v3.s14.archive-task-registry-alignment'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false");
    expect(migration).toContain(
      "create or replace function private.v3_resolve_archived_edition_workflow_tasks(",
    );
  });

  it("centralizes the canonical and compatibility current-workflow task vocabulary", () => {
    expect(migration).toContain(
      "create or replace function private.v3_archive_task_type_is_current_workflow(",
    );
    expect(migration).toContain(
      "~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast)\\.'",
    );
    expect(migration).toContain("~ '^edition\\.(transition|subsystem)\\.'");
    expect(migration).toContain("= 'edition.blocker'");
    expect(migration).not.toMatch(/p_task_type[^\n]*(incident|integrity)/);
  });

  it("resolves current-workflow tasks only after canonical runtime is archived", () => {
    expect(migration).toContain("runtime.state = 'archived'");
    expect(migration).toContain("task.state <> 'resolved'");
    expect(migration).toContain(
      "private.v3_archive_task_type_is_current_workflow(task.task_type)",
    );
  });

  it("enforces non-resurrection at the task-table boundary", () => {
    expect(migration).toContain(
      "create or replace function private.v3_guard_archived_edition_task_resurrection()",
    );
    expect(migration).toContain(
      "create trigger v3_guard_archived_edition_task_resurrection",
    );
    expect(migration).toContain("before insert or update on public.studio2_organizer_tasks");
    expect(migration).toContain("new.state := 'resolved'");
    expect(migration).toContain("new.resolved_at := coalesce(new.resolved_at, now())");
  });

  it("rehearses canonical blocker resolution and non-resurrection without sacrificing incident work", () => {
    expect(guardRehearsal).toContain("'edition.blocker','edition.manage'");
    expect(guardRehearsal).toContain("canonical edition.blocker fixture was not open before archive");
    expect(guardRehearsal).toContain("archive left canonical edition.blocker actionable");
    expect(guardRehearsal).toContain("archive incorrectly resolved legitimate incident governance work");
  });
});
