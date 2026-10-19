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

  it("resolves the canonical edition.blocker only after canonical runtime is archived", () => {
    expect(migration).toContain("runtime.state = 'archived'");
    expect(migration).toContain("task.task_type = 'edition.blocker'");
    expect(migration).toContain("task.state <> 'resolved'");
  });

  it("retains compatibility task families while excluding governance/history work", () => {
    expect(migration).toContain(
      "task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast)\\.'",
    );
    expect(migration).toContain("task.task_type ~ '^edition\\.(transition|subsystem)\\.'");
    expect(migration).not.toMatch(/task\.task_type[^\n]*(incident|integrity)/);
  });

  it("rehearses canonical blocker resolution without sacrificing incident work", () => {
    expect(guardRehearsal).toContain("'edition.blocker','edition.manage'");
    expect(guardRehearsal).toContain("canonical edition.blocker fixture was not open before archive");
    expect(guardRehearsal).toContain("archive left canonical edition.blocker actionable");
    expect(guardRehearsal).toContain("archive incorrectly resolved legitimate incident governance work");
  });
});
