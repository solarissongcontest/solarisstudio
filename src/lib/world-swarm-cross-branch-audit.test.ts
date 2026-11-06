import { describe, expect, it } from "vitest";
import { auditWorldSwarmCrossBranches, isPotentialWorldSwarmPull, type WorldSwarmPull, type WorldSwarmSnapshot } from "./world-swarm-cross-branch-audit";

const SHA = "a".repeat(40);
const MAIN = "b".repeat(40);
const path = (version: string, name: string) => `supabase/migrations/${version}_${name}.sql`;
const pr = (number: number, filenames: string[], baseRef = "main"): WorldSwarmPull => ({
  number, title: `World TG${number}`, branch: `v3/world/tg-${number}`, baseRef,
  headSha: SHA, draft: true,
  files: filenames.map((filename) => ({ filename, status: "added" as const })),
});
const snapshot = (pulls: WorldSwarmSnapshot["pulls"], mainMigrations: string[] = []): WorldSwarmSnapshot => ({
  repository: "solarissongcontest/solarisstudio", mainSha: MAIN, mainMigrations, pulls,
});
const codes = (value: WorldSwarmSnapshot) => auditWorldSwarmCrossBranches(value).issues.map((item) => item.code);

describe("TG19 read-only World cross-PR migration preflight", () => {
  it("accepts disjoint World migrations without declaring release certification", () => {
    const report = auditWorldSwarmCrossBranches(snapshot([
      pr(2245, [path("20261107110000", "tg9_statements")]),
      pr(2255, [path("20261107004000", "tg16_domestic")]),
    ]));
    expect(report.clean).toBe(true);
    expect(report.migrationsChecked).toBe(2);
    expect(report.caveat).toContain("does NOT establish SQL correctness");
  });

  it("rejects independent branches reusing one migration version with different filenames", () => {
    const report = auditWorldSwarmCrossBranches(snapshot([
      pr(1, [path("20261107140000", "tg9_resolutions")]),
      pr(2, [path("20261107140000", "tg15_recognition")]),
    ]));
    expect(report.clean).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "migration_version_overlap", severity: "error", prs: [1, 2],
    }));
  });

  it("detects collisions with main despite different migration suffixes", () => {
    const version = "20261107005000";
    expect(codes(snapshot([pr(9, [path(version, "alternate")])], [path(version, "original")]))).toContain("main_migration_collision");
  });

  it("disallows modifying an already present migration on main", () => {
    const filename = path("20261102171500", "tg2_foundation");
    const candidate = pr(1, []);
    candidate.files = [{ filename, status: "modified" }];
    expect(codes(snapshot([candidate], [filename]))).toContain("main_migration_modified");
  });

  it("rejects minute 60, impossible day, and non-leap February 29 in new migrations", () => {
    const report = auditWorldSwarmCrossBranches(snapshot([
      pr(10, [
        path("20261107006000", "invalid_minutes"),
        path("20261131001000", "invalid_day"),
        path("20270229012000", "invalid_leap"),
      ]),
    ]));
    expect(report.issues.filter((issue) => issue.code === "invalid_new_migration_calendar")).toHaveLength(3);
  });

  it("does not rename historical synthetic clock values already in main", () => {
    const original = path("20261003016000", "existing_legacy");
    const report = auditWorldSwarmCrossBranches(snapshot([pr(5, [path("20261107005500", "valid")])], [original]));
    expect(report.clean).toBe(true);
  });

  it("fails closed when a stacked parent is omitted from the PR snapshot", () => {
    const report = auditWorldSwarmCrossBranches(snapshot([
      pr(10, [path("20261107100100", "child")], "unlisted-parent"),
    ]));
    expect(report.clean).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "unresolved_stacked_parent", severity: "error",
    }));
  });

  it("downgrades direct stacked parent/child repeated path to review warning", () => {
    const filename = path("20261107123000", "tg7_intake");
    const a = pr(1, [filename]);
    const b = pr(2, [filename], a.branch);
    const report = auditWorldSwarmCrossBranches(snapshot([a, b]));
    expect(report.clean).toBe(true);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "migration_path_overlap", severity: "warning",
    }));
  });

  it("fails closed for invalid main and pull SHAs", () => {
    const value = snapshot([pr(1, [])]);
    value.mainSha = "main";
    value.pulls[0].headSha = "HEAD";
    expect(codes(value)).toContain("invalid_snapshot");
  });

  it("ignores a removed invalid path in a valid forward replacement", () => {
    const candidate = pr(27, [path("20261107005500", "tg15_valid")]);
    candidate.files.push({ filename: path("20261107006000", "tg15_invalid"), status: "removed" });
    const report = auditWorldSwarmCrossBranches(snapshot([candidate]));
    expect(report.clean).toBe(true);
    expect(report.migrationsChecked).toBe(2);
  });

  it("identifies independent modified-migration path collision", () => {
    const filename = path("20261107100100", "pending");
    const a = pr(1, []), b = pr(2, []);
    a.files.push({ filename, status: "modified" });
    b.files.push({ filename, status: "modified" });
    expect(codes(snapshot([a, b]))).toContain("migration_path_overlap");
  });
  it("blocks removing an already-merged main migration in stale stacked PRs", () => {
    const filename = path("20261104121500", "v3_tg2_office_term_effective_authority");
    const candidate = pr(1939, []);
    candidate.files.push({ filename, status: "removed" });
    const report = auditWorldSwarmCrossBranches(snapshot([candidate], [filename]));
    expect(report.clean).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "main_migration_removed", severity: "error", prs: [1939], paths: [filename],
    }));
  });

  it("allows deletion of a never-merged, invalid migration during a branch correction", () => {
    const candidate = pr(2271, [path("20261107005500", "v3_tg15_valid")]);
    candidate.files.push({
      filename: path("20261107006000", "v3_tg15_invalid"), status: "removed",
    });
    expect(auditWorldSwarmCrossBranches(snapshot([candidate])).clean).toBe(true);
  });

  it("collects World branches even when a PR title has no World keyword", () => {
    expect(isPotentialWorldSwarmPull({
      title: "Harden publication reader", branch: "v3/world/auto-replay-gates",
    })).toBe(true);
    expect(isPotentialWorldSwarmPull({
      title: "Institutional reader", branch: "v3/sys-terra-governance-documents",
    })).toBe(true);
    expect(isPotentialWorldSwarmPull({
      title: "[V3-WAVE2] TG4 legal documents", branch: "v3/integration-legal",
    })).toBe(true);
    expect(isPotentialWorldSwarmPull({
      title: "Update account settings", branch: "v3/public-account-settings",
    })).toBe(false);
  });

  it("does not allow a clean report when a historic donor base is absent", () => {
    const child = pr(1940, [path("20261103172500", "child")],
      "v3/sys-terra-governance-documents");
    const report = auditWorldSwarmCrossBranches(snapshot([child]));
    expect(report.clean).toBe(false);
    expect(report.issues.some((i) => i.code === "unresolved_stacked_parent")).toBe(true);
  });

  it("fails closed if a merged migration is renamed outside the migration directory", () => {
    const original = path("20261104121500", "v3_tg2_office_term_effective_authority");
    const candidate = pr(1939, []);
    candidate.files = [{
      filename: "docs/archive/obsolete.sql", status: "renamed", previousFilename: original,
    }];
    const report = auditWorldSwarmCrossBranches(snapshot([candidate], [original]));
    expect(report.clean).toBe(false);
    expect(report.migrationsChecked).toBe(1);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "main_migration_removed", severity: "error",
      paths: [original, "docs/archive/obsolete.sql"],
    }));
  });

  it("permits an unmerged invalid migration's forward rename to a valid version", () => {
    const candidate = pr(2271, []);
    candidate.files = [{
      filename: path("20261107005500", "v3_tg15_valid"),
      previousFilename: path("20261107006000", "v3_tg15_invalid"),
      status: "renamed",
    }];
    const report = auditWorldSwarmCrossBranches(snapshot([candidate]));
    expect(report.clean).toBe(true);
    expect(report.migrationsChecked).toBe(1);
  });

});
