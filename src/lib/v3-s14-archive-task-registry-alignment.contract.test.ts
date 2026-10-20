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
const archiveInvariantFixes = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
  ),
  "utf8",
);
const guardRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-archive-guard-rehearsal.sh"),
  "utf8",
);
const resurrectionRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh"),
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

  it("enforces non-resurrection and historical deletion protection at the task-table boundary", () => {
    expect(migration).toContain(
      "create or replace function private.v3_guard_archived_edition_task_resurrection()",
    );
    expect(migration).toContain(
      "create trigger v3_guard_archived_edition_task_resurrection",
    );
    expect(migration).toContain("before insert or update on public.studio2_organizer_tasks");
    expect(migration).toContain("new.state := 'resolved'");
    expect(archiveInvariantFixes).toContain("old.resolved_at, new.resolved_at, now()");
    expect(archiveInvariantFixes).toContain("if tg_op = 'UPDATE' then");
    expect(archiveInvariantFixes).toContain("if tg_op = 'DELETE' then");
    expect(archiveInvariantFixes).toContain("Archived edition workflow task history is read-only.");
    expect(archiveInvariantFixes).toContain(
      "before insert or update or delete on public.studio2_organizer_tasks",
    );
  });

  it("rehearses canonical blocker resolution without sacrificing incident work", () => {
    expect(guardRehearsal).toContain("'edition.blocker','edition.manage'");
    expect(guardRehearsal).toContain("canonical edition.blocker fixture was not open before archive");
    expect(guardRehearsal).toContain("archive left canonical edition.blocker actionable");
    expect(guardRehearsal).toContain("archive incorrectly resolved legitimate incident governance work");
  });

  it("proves update, insert and delete attempts cannot corrupt archived current-workflow Task history", () => {
    expect(resurrectionRehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(resurrectionRehearsal).toContain("bun run scripts/check-v3-production-isolation.ts");
    expect(resurrectionRehearsal).toContain(
      "attempt to resurrect the canonical Edition blocker",
    );
    expect(resurrectionRehearsal).toContain("archived edition.blocker was resurrected");
    expect(resurrectionRehearsal).toContain("resurrection guard rewrote historical blocker resolution timestamp");
    expect(resurrectionRehearsal).toContain("Archived current-workflow Task evidence cannot be deleted");
    expect(resurrectionRehearsal).toContain("archived current-workflow task evidence was deletable");
    expect(resurrectionRehearsal).toContain("archived task deletion did not fail through the historical-evidence guard");
    expect(resurrectionRehearsal).toContain("Attempt to create new impossible current-contest work after Archive");
    expect(resurrectionRehearsal).toContain("new impossible archived-edition task became actionable");
    expect(resurrectionRehearsal).toContain("task invariant incorrectly resolved incident governance work");
    expect(resurrectionRehearsal).not.toMatch(/supabase\.co/i);
    expect(guardRehearsal).toContain("direct archived runtime reversal");
    expect(guardRehearsal).toContain("direct SQL reversed an archived runtime");
  });
});
