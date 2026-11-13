import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "solaris-frontier-offline-"));
  temporary.push(root);
  for (const path of ["scripts", "src/lib", "supabase/migrations"])
    mkdirSync(join(root, path), { recursive: true });
  for (const path of [
    "scripts/check-v3-production-migration-frontier.ts",
    "src/lib/v3-production-migration-frontier.ts",
  ])
    copyFileSync(new URL(`../../${path}`, import.meta.url), join(root, path));
  const migration = "supabase/migrations/20261101181812_tip.sql";
  writeFileSync(join(root, migration), "select 1;\n");
  writeFileSync(
    join(root, "supabase/migrations/20261014010000_local_bootstrap.sql"),
    "select 1;\n",
  );
  const history = [
    { version: "20261001202836", name: "synthetic_bootstrap" },
    { version: "20261101181812", name: "tip" },
  ];
  writeFileSync(join(root, "history.json"), JSON.stringify(history));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Offline test",
    "-c",
    "user.email=offline@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Synthetic local metadata",
  );
  const sha = git("rev-parse", "HEAD");
  const run = (...flags: string[]) => {
    const result = spawnSync(
      "bun",
      [
        "scripts/check-v3-production-migration-frontier.ts",
        "--remote-history",
        "history.json",
        "--json",
        "--expected-sha",
        sha,
        ...flags,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return { code: result.status, report: JSON.parse(result.stdout) };
  };
  return { root, migration, sha, run };
}

describe("offline frontier CLI on isolated synthetic repositories", () => {
  it("separates permitted bootstrap history from raw Preview refusal without modifying inputs", () => {
    const f = fixture();
    const before = readFileSync(join(f.root, "history.json"), "utf8");
    const reconciled = f.run("--require-reconciled");
    expect(reconciled.code).toBe(0);
    expect(reconciled.report).toMatchObject({
      historyReconciled: true,
      previewHistoryCompatible: false,
      migrationSourcesClean: true,
      auditorSourcesClean: true,
      sqlEffectsVerified: false,
      productionDeploymentAuthorized: false,
    });
    expect(f.run("--require-preview-compatible").code).toBe(1);
    expect(readFileSync(join(f.root, "history.json"), "utf8")).toBe(before);
    expect(reconciled.report.sourceInventorySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reconciled.report.auditorSourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reconciled.report.historyEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("strict Preview rejects a local bootstrap hole without blocking approved historical reconciliation", () => {
    const f = fixture();
    writeFileSync(
      join(f.root, "history.json"),
      JSON.stringify([{ version: "20261101181812", name: "tip" }]),
    );
    const reconciliation = f.run("--require-reconciled");
    expect(reconciliation.code).toBe(0);
    expect(reconciliation.report.historyReconciled).toBe(true);
    expect(reconciliation.report.remoteVersionsMissingLocally).toEqual([]);
    expect(reconciliation.report.previewLocalVersionsMissingRemotely).toHaveLength(1);
    const preview = f.run("--require-preview-compatible");
    expect(preview.code).toBe(1);
    expect(preview.report.previewHistoryCompatible).toBe(false);
  });

  it("refuses tracked SQL changes even when filename, history and expected commit match", () => {
    const f = fixture();
    const before = f.run().report.sourceInventorySha256;
    writeFileSync(join(f.root, f.migration), "select 2;\n");
    const changed = f.run("--require-reconciled");
    expect(changed.code).toBe(1);
    expect(changed.report.migrationSourcesClean).toBe(false);
    expect(changed.report.sourceInventorySha256).not.toBe(before);
    expect(changed.report.candidateSha).toBe(f.sha);
  });

  it("rejects ignored untracked SQL that git status omits", () => {
    const f = fixture();
    writeFileSync(join(f.root, ".git/info/exclude"), "*.sql\n");
    writeFileSync(join(f.root, "supabase/migrations/20261102181812_ignored.sql"), "select 4;\n");
    expect(f.run().code).toBe(1);
    expect(f.run().report.migrationSourcesClean).toBe(false);
  });

  it("rejects skip-worktree SQL edits even when status is clean", () => {
    const f = fixture();
    execFileSync("git", ["update-index", "--skip-worktree", f.migration], { cwd: f.root });
    writeFileSync(join(f.root, f.migration), "select 5;\n");
    expect(f.run().code).toBe(1);
    expect(f.run().report.migrationSourcesClean).toBe(false);
  });

  it("refuses edited auditor implementation with clean migrations and an unchanged HEAD", () => {
    const f = fixture();
    const auditorPath = join(f.root, "src/lib/v3-production-migration-frontier.ts");
    const clean = f.run("--require-reconciled");
    expect(clean.code).toBe(0);
    writeFileSync(auditorPath, readFileSync(auditorPath, "utf8") + "\n// local drift\n");
    const changed = f.run("--require-reconciled");
    expect(changed.code).toBe(1);
    expect(changed.report).toMatchObject({
      migrationSourcesClean: true,
      auditorSourcesClean: false,
      candidateSha: f.sha,
      requirementsSatisfied: false,
    });
    expect(changed.report.auditorSourceSha256).not.toBe(clean.report.auditorSourceSha256);
  });

  it("rejects staged auditor script changes without rewriting the candidate commit", () => {
    const f = fixture();
    const script = "scripts/check-v3-production-migration-frontier.ts";
    const path = join(f.root, script);
    writeFileSync(path, readFileSync(path, "utf8") + "\n// staged drift\n");
    execFileSync("git", ["add", script], { cwd: f.root });
    const changed = f.run("--require-reconciled");
    expect(changed.code).toBe(1);
    expect(changed.report.auditorSourcesClean).toBe(false);
    expect(changed.report.migrationSourcesClean).toBe(true);
    expect(changed.report.candidateSha).toBe(f.sha);
  });

  it("rejects auditor implementation edits hidden by skip-worktree", () => {
    const f = fixture();
    const script = "src/lib/v3-production-migration-frontier.ts";
    execFileSync("git", ["update-index", "--skip-worktree", script], { cwd: f.root });
    const path = join(f.root, script);
    writeFileSync(path, readFileSync(path, "utf8") + "\n// hidden drift\n");
    const changed = f.run("--require-reconciled");
    expect(changed.code).toBe(1);
    expect(changed.report.auditorSourcesClean).toBe(false);
    expect(changed.report.migrationSourcesClean).toBe(true);
  });

  it("refuses untracked SQL instead of treating a matching HEAD as exact-source proof", () => {
    const f = fixture();
    writeFileSync(join(f.root, "supabase/migrations/20261102181812_unreviewed.sql"), "select 3;\n");
    expect(f.run().code).toBe(1);
    expect(f.run().report.migrationSourcesClean).toBe(false);
  });
});
