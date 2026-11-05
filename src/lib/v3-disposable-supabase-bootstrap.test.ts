import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(".github/scripts/v3-start-disposable-supabase.sh");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(failedStarts: number, cleanupFails = false, config = true, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "v3-disposable-bootstrap-"));
  roots.push(root);
  const project = join(root, "project");
  const bin = join(root, "bin");
  const log = join(root, "calls");
  mkdirSync(join(project, "supabase"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(log, "");
  if (config) writeFileSync(join(project, "supabase/config.toml"), 'project_id = "disposable-test"\n');
  writeFileSync(join(bin, "supabase"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\\n' "$PWD" "$*" >> "$BOOTSTRAP_LOG"
if [[ "$*" == 'start' ]]; then
  attempt=0
  if [[ -f "$BOOTSTRAP_COUNT" ]]; then read -r attempt < "$BOOTSTRAP_COUNT"; fi
  attempt=$((attempt + 1))
  printf '%s\\n' "$attempt" > "$BOOTSTRAP_COUNT"
  (( attempt > FAILED_STARTS ))
elif [[ "$*" == 'stop --no-backup' ]]; then
  [[ "$CLEANUP_FAILS" == false ]]
else
  exit 90
fi
`, { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), `#!/usr/bin/env bash
printf '%s|sleep %s\\n' "$PWD" "$*" >> "$BOOTSTRAP_LOG"
`, { mode: 0o755 });
  const result = spawnSync("bash", [script, ...args], {
    cwd: project,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BOOTSTRAP_LOG: log,
      BOOTSTRAP_COUNT: join(root, "attempts"),
      FAILED_STARTS: String(failedStarts),
      CLEANUP_FAILS: String(cleanupFails),
    },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  expect(calls.every((line) => line.startsWith(`${project}|`))).toBe(true);
  return { ...result, commands: calls.map((line) => line.split("|")[1]) };
}

describe("disposable local Supabase bootstrap recovery", () => {
  it("does not clean or retry a successful startup", () => {
    const result = run(0);
    expect(result.status).toBe(0);
    expect(result.commands).toEqual(["start"]);
  });

  it("cleans the exact current project before the single bounded retry", () => {
    const result = run(1);
    expect(result.status).toBe(0);
    expect(result.commands).toEqual(["start", "stop --no-backup", "sleep 8", "start"]);
  });

  it("cleans both partial starts and fails closed after the second failure", () => {
    const result = run(2);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual(["start", "stop --no-backup", "sleep 8", "start", "stop --no-backup"]);
    expect(result.stderr).toContain("no hosted fallback");
  });

  it("refuses to retry when partial-stack cleanup fails", () => {
    const result = run(1, true);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual(["start", "stop --no-backup"]);
    expect(result.stderr).toContain("cleanup failed");
  });

  it("refuses a directory without a Supabase project", () => {
    const result = run(0, false, false);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual([]);
  });

  it("rejects arguments rather than letting a caller redirect cleanup", () => {
    const result = run(0, false, true, ["--linked"]);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual([]);
  });

  it("uses recovery for clean and upgrade startup without changing rehearsal assertions", () => {
    for (const domain of ["publication", "entry"]) {
      const workflow = readFileSync(`.github/workflows/v3-s5-${domain}-consequences-rehearsal.yml`, "utf8");
      expect(workflow).toContain("run: bash .github/scripts/v3-start-disposable-supabase.sh");
      expect(workflow).toContain('bash "$GITHUB_WORKSPACE/.github/scripts/v3-start-disposable-supabase.sh"');
      expect(workflow).toContain("supabase db reset --local --no-seed");
      expect(workflow).toContain("supabase migration up --local --include-all");
      expect(workflow).not.toMatch(/^\s+(?:run: )?supabase start$/m);
    }
  });
  it("keeps every Rules/Integrity upgrade script attached to the upgraded disposable worktree", () => {
    const workflow = readFileSync(".github/workflows/rules-integrity-migration-rehearsal.yml", "utf8");
    const upgrade = workflow.split("  upgrade-from-main:")[1];
    expect(upgrade).toBeDefined();
    const operations = (upgrade ?? "").split(/\n      - /).filter((step) => step.includes(".github/scripts/"));
    expect(operations.length).toBeGreaterThan(0);
    for (const step of operations) {
      expect(step).toContain("cd /tmp/solaris-main");
      expect(step).toContain('$GITHUB_WORKSPACE/.github/scripts/');
    }
  });
});
