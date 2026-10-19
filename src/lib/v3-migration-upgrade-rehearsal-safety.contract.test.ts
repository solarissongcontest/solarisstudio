import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");
const helper = readFileSync(resolve(root, ".github/scripts/v3-copy-migration-delta.sh"), "utf8");

function workflowFiles() {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

describe("System V3 current-main migration rehearsal safety", () => {
  it("never mirrors the feature migration directory destructively over current main", () => {
    const offenders: string[] = [];
    for (const name of workflowFiles()) {
      const content = readFileSync(resolve(workflowsDir, name), "utf8");
      const destructiveRsync = /rsync[^\n]*(?:--delete[^\n]*supabase\/migrations|supabase\/migrations[^\n]*--delete)/i;
      const destructiveRm = /rm\s+-rf[^\n]*supabase\/migrations/i;
      if (destructiveRsync.test(content) || destructiveRm.test(content)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it("copies only additive migration deltas and fails closed on history drift", () => {
    expect(helper).toContain('diff --name-only --diff-filter=D "$BASE_REF"...HEAD');
    expect(helper).toContain('diff --name-only --diff-filter=AM "$BASE_REF"...HEAD');
    expect(helper).toContain('cmp -s "$source_path" "$target_path"');
    expect(helper).toContain('install -m 0644 "$source_path" "$target_path"');
    expect(helper).toContain("refuses destructive migration history");
    expect(helper).toContain("conflicting migration content");
    expect(helper).not.toContain("rsync");
    expect(helper).not.toContain("--delete");
  });
});
