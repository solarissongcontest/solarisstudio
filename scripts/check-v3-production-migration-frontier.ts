#!/usr/bin/env bun
/**
 * Offline production migration frontier preflight.
 *
 * Example (operator-generated READ-ONLY Supabase migration metadata):
 *   bun run scripts/check-v3-production-migration-frontier.ts \\
 *     --remote-history /tmp/solaris-hosted-migration-history.json \\
 *     --require-reconciled --json
 *
 * No network or Supabase client is used. Never include production credentials
 * or application row data in the input file.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditV3ProductionMigrationFrontier,
  assessV3ProductionMigrationCandidateIdentity,
  type HostedMigration,
} from "../src/lib/v3-production-migration-frontier";

const args = process.argv.slice(2);
const flagValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : (args[index + 1] ?? null);
};
const remotePath = flagValue("--remote-history");
if (!remotePath || remotePath.startsWith("--")) {
  console.error("FAIL CLOSED: provide --remote-history <read-only hosted migration JSON file>");
  process.exit(2);
}

try {
  const historyBytes = readFileSync(resolve(remotePath), "utf8");
  const source = JSON.parse(historyBytes) as { migrations: HostedMigration[] } | HostedMigration[];
  const hosted = Array.isArray(source) ? source : source.migrations;
  if (!Array.isArray(hosted))
    throw new Error("Hosted evidence must be a JSON array or {migrations: array}");

  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const repositoryFiles = readdirSync(resolve(root, "supabase/migrations"));
  const audit = auditV3ProductionMigrationFrontier(repositoryFiles, hosted);
  // git status alone can omit ignored SQL and skip-worktree changes. Compare
  // actual file identities and Git blob bytes directly with the candidate tree.
  const sqlFiles = repositoryFiles.filter((name) => name.endsWith(".sql")).sort();
  const committedSql = execFileSync("git", ["ls-tree", "-r", "HEAD", "--", "supabase/migrations"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((line) => line.endsWith(".sql"));
  const actualBlobs = sqlFiles.length
    ? execFileSync("git", ["hash-object", "--no-filters", "--stdin-paths"], {
        cwd: root,
        encoding: "utf8",
        input: sqlFiles.map((name) => "supabase/migrations/" + name).join("\n") + "\n",
      })
        .trim()
        .split("\n")
    : [];
  const candidateSqlMatches =
    committedSql.length === sqlFiles.length &&
    sqlFiles.every(
      (name, i) =>
        lstatSync(resolve(root, "supabase/migrations", name)).isFile() &&
        committedSql.includes("100644 blob " + actualBlobs[i] + "\tsupabase/migrations/" + name),
    );
  const migrationSourcesClean =
    candidateSqlMatches &&
    execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", "supabase/migrations"],
      { cwd: root, encoding: "utf8" },
    ).trim() === "";
  const sourceInventorySha256 = createHash("sha256")
    .update(
      JSON.stringify(
        repositoryFiles
          .filter((name) => name.endsWith(".sql"))
          .sort()
          .map((name) => ({
            filename: name,
            sha256: createHash("sha256")
              .update(readFileSync(resolve(root, "supabase/migrations", name)))
              .digest("hex"),
          })),
      ),
    )
    .digest("hex");
  const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const expectedSha = flagValue("--expected-sha");
  const strictReconciliation = args.includes("--require-reconciled");
  const requirePreview = args.includes("--require-preview-compatible");
  const identity = assessV3ProductionMigrationCandidateIdentity(
    candidateSha,
    expectedSha,
    strictReconciliation || requirePreview,
  );
  const requirementsSatisfied =
    migrationSourcesClean &&
    identity.acceptable &&
    (!strictReconciliation || audit.historyReconciled) &&
    (!requirePreview || audit.previewHistoryCompatible);
  const result = {
    candidateSha,
    migrationSourcesClean,
    sourceInventorySha256,
    historyEvidenceSha256: createHash("sha256").update(historyBytes).digest("hex"),
    ...audit,
    requirementsSatisfied,
    candidateShaMatchesExpected: identity.matchesExpected,
    candidateIdentityError: identity.error,
    sqlEffectsVerified: false,
    productionDeploymentAuthorized: false,
    note: "Read-only history reconciliation only: never proof of migration replay, data compatibility, deployment approval or release certification.",
  };

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `V3 production migration frontier (${candidateSha}): ${audit.historyReconciled && requirementsSatisfied ? "RECONCILED" : "BLOCKED"}`,
    );
    console.log(
      `Hosted head: ${audit.hostedHead ?? "missing"}; repository head: ${audit.repositoryHead ?? "missing"}`,
    );
    console.log(
      `Historical bootstrap-only versions: repository ${audit.historicalRepoOnlyCount}, hosted ${audit.historicalHostedOnlyCount}`,
    );
    console.log(`Post-cutover holes before hosted head: ${audit.holesBeforeHostedHead.length}`);
    console.log(`Hosted-only post-cutover changes: ${audit.unknownHostedPostCutover.length}`);
    console.log(
      `Timestamp/name mismatches: ${audit.nameMismatches.length}; malformed/duplicate entries: ${audit.errors.length}`,
    );
    console.log(
      `Raw Preview history compatibility: ${audit.previewHistoryCompatible ? "COMPATIBLE" : "BLOCKED"}`,
    );
    for (const f of audit.remoteVersionsMissingLocally)
      console.error(
        `PREVIEW REMOTE VERSION MISSING LOCALLY: ${f.version} ${f.name ?? "unnamed"}${f.version <= audit.bootstrapCutover ? " (immutable bootstrap representation; not permission to manufacture history)" : " (post-cutover unknown)"}`,
      );
    console.log(`Newer repository candidates: ${audit.pendingAfterHostedHead.length}`);
    for (const f of audit.holesBeforeHostedHead) console.error(`UNAPPLIED HOLE: ${f.filename}`);
    for (const f of audit.unknownHostedPostCutover)
      console.error(`HOSTED-ONLY: ${f.version} ${f.name ?? "unnamed"}`);
    for (const issue of audit.nameMismatches)
      console.error(
        `NAME MISMATCH: ${issue.version} (${issue.repositoryName} != ${issue.hostedName})`,
      );
    for (const error of audit.errors) console.error(`INVALID EVIDENCE: ${error}`);
    if (!migrationSourcesClean)
      console.error("SOURCE DRIFT: migration files differ from the candidate commit");
    if (identity.error) console.error(`CANDIDATE IDENTITY: ${identity.error}`);
  }

  if (!requirementsSatisfied) process.exit(1);
} catch (error) {
  console.error(
    `FAIL CLOSED: could not verify hosted migration history: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
}
