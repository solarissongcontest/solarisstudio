/**
 * TG19 read-only cross-PR World migration preflight. Never certifies releases.
 * Checks migration filenames and pull-request metadata, not hosted Supabase.
 */
export type WorldSwarmChangeStatus = "added" | "modified" | "removed" | "renamed" | "copied";
export interface WorldSwarmChangedFile {
  filename: string;
  status: WorldSwarmChangeStatus;
  previousFilename?: string;
}
export interface WorldSwarmPull {
  number: number;
  title: string;
  branch: string;
  baseRef: string;
  headSha: string;
  draft: boolean;
  files: WorldSwarmChangedFile[];
}
export interface WorldSwarmSnapshot {
  repository: string;
  mainSha: string;
  mainMigrations: string[];
  pulls: WorldSwarmPull[];
}
export interface WorldSwarmAuditIssue {
  severity: "error" | "warning";
  code:
    | "invalid_snapshot"
    | "duplicate_pr_number"
    | "main_migration_collision"
    | "main_migration_modified"
    | "main_migration_removed"
    | "migration_path_overlap"
    | "migration_version_overlap"
    | "invalid_new_migration_calendar"
    | "unresolved_stacked_parent";
  message: string;
  prs: number[];
  paths: string[];
}
export interface WorldSwarmAuditReport {
  repository: string;
  mainSha: string;
  pullCount: number;
  migrationsChecked: number;
  clean: boolean;
  issues: WorldSwarmAuditIssue[];
  caveat: string;
}
/** Include World-scope branches even when PR titles omit "WORLD"/"TG". */
export function isPotentialWorldSwarmPull(pull: { title: string; branch: string }): boolean {
  const branch = pull.branch.trim().toLowerCase();
  const title = pull.title.trim().toLowerCase();
  return /^v3\/(?:world(?:\/|-)|sys-terra-governance(?:\/|-|$)|swarm-wave2\/tg\d)/.test(branch)
    || /\b(?:terra solaris|terra governance|world(?:-swarm)?|tg(?:[0-9]|1[0-9]))\b/.test(title);
}

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const MIGRATION = /^supabase\/migrations\/(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const NEW_DATE_FLOOR = "20261101000000";
function versionOf(path: string): string | null {
  return MIGRATION.exec(path)?.[1] ?? null;
}
function validCalendar(version: string): boolean {
  if (!/^\d{14}$/.test(version)) return false;
  const y = Number(version.slice(0, 4));
  const m = Number(version.slice(4, 6));
  const d = Number(version.slice(6, 8));
  const h = Number(version.slice(8, 10));
  const min = Number(version.slice(10, 12));
  const s = Number(version.slice(12, 14));
  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return false;
  const date = new Date(Date.UTC(y, m - 1, d, h, min, s));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}
function addIssue(issues: WorldSwarmAuditIssue[], issue: WorldSwarmAuditIssue): void {
  if (!issues.some((e) => e.code === issue.code && e.prs.join() === issue.prs.join() && e.paths.join() === issue.paths.join())) issues.push(issue);
}
export function auditWorldSwarmCrossBranches(snapshot: WorldSwarmSnapshot): WorldSwarmAuditReport {
  if (!snapshot || !Array.isArray(snapshot.pulls) || !Array.isArray(snapshot.mainMigrations)) {
    throw new Error("World migration snapshot requires pulls and mainMigrations arrays");
  }
  const issues: WorldSwarmAuditIssue[] = [];
  const invalid = (message: string, prs: number[] = []) => addIssue(issues, {
    severity: "error", code: "invalid_snapshot", message, prs, paths: [],
  });
  if (!EXACT_SHA.test(snapshot.mainSha)) invalid("Main must have an exact 40-character SHA");
  if (snapshot.repository !== "solarissongcontest/solarisstudio") invalid("Unexpected repository");
  const mainPaths = new Set(snapshot.mainMigrations);
  const mainByVersion = new Map<string, string>();
  for (const path of snapshot.mainMigrations) {
    const v = versionOf(path);
    if (!v) continue;
    const prior = mainByVersion.get(v);
    if (prior && prior !== path) invalid(`Main has duplicate migration version ${v}: ${prior}, ${path}`);
    else mainByVersion.set(v, path);
  }
  const byNumber = new Map<number, WorldSwarmPull>();
  const byBranch = new Map<string, WorldSwarmPull>();
  for (const pull of snapshot.pulls) {
    if (!Number.isSafeInteger(pull.number) || pull.number <= 0 || !EXACT_SHA.test(pull.headSha) ||
      !pull.branch || !pull.baseRef || !Array.isArray(pull.files)) {
      invalid(`Invalid PR metadata for #${pull.number}`, [pull.number]);
    }
    if (byNumber.has(pull.number)) addIssue(issues, {
      severity: "error", code: "duplicate_pr_number", message: `PR #${pull.number} occurs twice`,
      prs: [pull.number], paths: [],
    });
    byNumber.set(pull.number, pull);
    byBranch.set(pull.branch, pull);
  }
  type Occurrence = { pr: number; path: string };
  const proposedByVersion = new Map<string, Occurrence[]>();
  const changedByPath = new Map<string, Array<{ pr: number; status: WorldSwarmChangeStatus }>>();
  let migrationsChecked = 0;
  for (const pull of snapshot.pulls) {
    if (pull.baseRef !== "main" && !byBranch.has(pull.baseRef)) addIssue(issues, {
      severity: "error", code: "unresolved_stacked_parent",
      message: `PR #${pull.number} targets ${pull.baseRef}, which is absent from this snapshot; cannot verify inherited migration ancestry`,
      prs: [pull.number], paths: [],
    });
    for (const file of pull.files) {
      const isMigration = (path: string) =>
        path.startsWith("supabase/migrations/") && path.endsWith(".sql");
      const sourcePath = file.previousFilename;
      const destinationIsMigration = isMigration(file.filename);
      const sourceIsMigration = Boolean(sourcePath && isMigration(sourcePath));
      if (!destinationIsMigration && !sourceIsMigration) continue;
      migrationsChecked++;
      if (file.status === "renamed" && sourceIsMigration && sourcePath && mainPaths.has(sourcePath)) {
        addIssue(issues, {
          severity: "error", code: "main_migration_removed",
          message: `PR #${pull.number} renames an existing main migration; migration history must remain forward-only`,
          prs: [pull.number], paths: [sourcePath, file.filename],
        });
      }
      // A migration renamed out of the SQL directory is not an incoming new
      // migration, but its old path must still be checked above.
      if (!destinationIsMigration) continue;
      const v = versionOf(file.filename);
      if (!v) {
        invalid(`PR #${pull.number} has a noncanonical migration filename: ${file.filename}`, [pull.number]);
        continue;
      }
      const changes = changedByPath.get(file.filename) ?? [];
      changes.push({ pr: pull.number, status: file.status });
      changedByPath.set(file.filename, changes);
      if (file.status === "removed") {
        // A PR that removes a file already on main can silently undo an applied
        // migration when its parent/merge-base is stale. This is different
        // from removing an unmerged invalid proposal on the SAME branch.
        if (mainPaths.has(file.filename)) addIssue(issues, {
          severity: "error", code: "main_migration_removed",
          message: `PR #${pull.number} removes a migration already on main; restore upstream history before integration`,
          prs: [pull.number], paths: [file.filename],
        });
        continue;
      }
      if (mainPaths.has(file.filename) && file.status !== "added") addIssue(issues, {
        severity: "error", code: "main_migration_modified",
        message: `PR #${pull.number} changes an existing main migration (${file.status}); create a new forward-only migration`,
        prs: [pull.number], paths: [file.filename],
      });
      if (file.status === "added" || file.status === "copied" || file.status === "renamed") {
        if (v >= NEW_DATE_FLOOR && !validCalendar(v)) addIssue(issues, {
          severity: "error", code: "invalid_new_migration_calendar",
          message: `PR #${pull.number} adds invalid calendar/clock version ${v}; older main legacy names are grandfathered`,
          prs: [pull.number], paths: [file.filename],
        });
        const onMain = mainByVersion.get(v);
        if (onMain) addIssue(issues, {
          severity: "error", code: "main_migration_collision",
          message: `PR #${pull.number} proposes version ${v}, already on main as ${onMain}`,
          prs: [pull.number], paths: [onMain, file.filename],
        });
        const rows = proposedByVersion.get(v) ?? [];
        rows.push({ pr: pull.number, path: file.filename });
        proposedByVersion.set(v, rows);
      }
    }
  }
  for (const [v, rows] of proposedByVersion) {
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const ap = byNumber.get(a.pr), bp = byNumber.get(b.pr);
      const stacked = ap?.baseRef === bp?.branch || bp?.baseRef === ap?.branch;
      addIssue(issues, {
        severity: stacked ? "warning" : "error",
        code: a.path === b.path ? "migration_path_overlap" : "migration_version_overlap",
        message: `Version ${v} is proposed in PR #${a.pr} and #${b.pr}${stacked ? "; verify stacked diff/retarget" : "; independent branches cannot both land it"}`,
        prs: [a.pr, b.pr].sort((x, y) => x - y), paths: [a.path, b.path].sort(),
      });
    }
  }
  for (const [path, changes] of changedByPath) {
    const active = changes.filter((c) => c.status !== "removed");
    const distinct = [...new Set(active.map((c) => c.pr))];
    if (distinct.length < 2) continue;
    const allProposals = active.every((c) => c.status === "added" || c.status === "copied" || c.status === "renamed");
    if (allProposals && proposedByVersion.get(versionOf(path) ?? "")?.filter((r) => r.path === path).length === distinct.length) continue;
    addIssue(issues, {
      severity: "error", code: "migration_path_overlap",
      message: `Multiple PRs modify the same migration path ${path}`,
      prs: distinct.sort((a, b) => a - b), paths: [path],
    });
  }
  issues.sort((a, b) => a.code.localeCompare(b.code) || a.prs.join().localeCompare(b.prs.join()) || a.paths.join().localeCompare(b.paths.join()));
  return {
    repository: snapshot.repository, mainSha: snapshot.mainSha,
    pullCount: snapshot.pulls.length, migrationsChecked,
    clean: !issues.some((issue) => issue.severity === "error"),
    issues,
    caveat: "Filename/PR-diff preflight only. Clean does NOT establish SQL correctness, dependency ancestry, exact-head CI, local DB adoption, merge authorization, deployment, or TG19 certification.",
  };
}
