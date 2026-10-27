import { candidateSnapshotFindings } from "../../scripts/lib/v3-release-preflight";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("release source integrity with local CLI metadata", () => {
  it("reproduces untracked cache dirtiness and excludes only generated cache, never migration/config source", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-source-integrity-"));
    const ignore = readFileSync(".gitignore", "utf8");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    try {
      git("init", "-q");
      writeFileSync(join(dir, ".gitignore"), ignore.replace("/supabase/.temp/", "").replace("/supabase/.branches/_current_branch", ""));
      git("add", ".gitignore");
      git("-c", "user.name=Fixture", "-c", "user.email=fixture@local.invalid", "commit", "-qm", "Source fixture");
      mkdirSync(join(dir, "supabase/.temp"), { recursive: true });
      mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
      mkdirSync(join(dir, "supabase/.branches"), { recursive: true });
      writeFileSync(join(dir, "supabase/.branches/_current_branch"), "main");
      writeFileSync(join(dir, "supabase/.branches/source.sql"), "select 1;");
      writeFileSync(join(dir, "supabase/.temp/cli-latest"), "2.113.0");
      writeFileSync(join(dir, "supabase/migrations/new.sql"), "select 1;");
      writeFileSync(join(dir, "supabase/config.toml"), 'project_id="local"\n');
      expect(git("status", "--porcelain", "--untracked-files=all")).toContain("supabase/.temp/cli-latest");
      expect(git("status", "--porcelain", "--untracked-files=all")).toContain("supabase/.branches/_current_branch");
      writeFileSync(join(dir, ".gitignore"), ignore);
      const status = git("status", "--porcelain", "--untracked-files=all");
      expect(status).not.toContain("supabase/.temp/cli-latest");
      expect(status).not.toContain("supabase/.branches/_current_branch");
      expect(status).toContain("supabase/.branches/source.sql");
      expect(status).toContain("supabase/migrations/new.sql");
      expect(status).toContain("supabase/config.toml");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

it("rejects a clean checkout that moved to a different commit during verification", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-commit-drift-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const commit = () => git("-c", "user.name=Fixture", "-c", "user.email=fixture@local.invalid", "commit", "-qm", "Fixture");
  try {
    git("init", "-q");
    writeFileSync(join(dir, "source.txt"), "first"); git("add", "source.txt"); commit();
    const before = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "source.txt"), "second"); git("add", "source.txt"); commit();
    const after = git("rev-parse", "HEAD");
    expect(git("status", "--porcelain")).toBe("");
    expect(candidateSnapshotFindings(before, after, [])).toEqual([`CANDIDATE_CHANGED ${before} -> ${after}`]);
    expect(candidateSnapshotFindings(after, after, [])).toEqual([]);
    expect(candidateSnapshotFindings(after, after, [" M source.txt"])).toEqual(["SOURCE_MUTATION  M source.txt"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
