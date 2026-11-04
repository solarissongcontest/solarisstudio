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
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  auditV3ProductionMigrationFrontier,
  type HostedMigration,
} from "../src/lib/v3-production-migration-frontier";

const args = process.argv.slice(2);
const flagValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1] ?? null;
};
const remotePath = flagValue("--remote-history");
if (!remotePath || remotePath.startsWith("--")) {
  console.error("FAIL CLOSED: provide --remote-history <read-only hosted migration JSON file>");
  process.exit(2);
}

try {
  const source = JSON.parse(readFileSync(resolve(remotePath), "utf8")) as
    | { migrations: HostedMigration[] }
    | HostedMigration[];
  const hosted = Array.isArray(source) ? source : source.migrations;
  if (!Array.isArray(hosted)) throw new Error("Hosted evidence must be a JSON array or {migrations: array}");

  const root = resolve(import.meta.dir, "..");
  const repositoryFiles = readdirSync(resolve(root, "supabase/migrations"));
  const audit = auditV3ProductionMigrationFrontier(repositoryFiles, hosted);
  const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const expectedSha = flagValue("--expected-sha");
  const shaMismatch = expectedSha !== null && candidateSha !== expectedSha;
  const result = {
    candidateSha,
    ...audit,
    candidateShaMatchesExpected: !shaMismatch,
    productionDeploymentAuthorized: false,
    note: "Read-only history reconciliation only: never proof of migration replay, data compatibility, deployment approval or release certification.",
  };

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`V3 production migration frontier (${candidateSha}): ${audit.historyReconciled && !shaMismatch ? "RECONCILED" : "BLOCKED"}`);
    console.log(`Hosted head: ${audit.hostedHead ?? "missing"}; repository head: ${audit.repositoryHead ?? "missing"}`);
    console.log(`Historical bootstrap-only versions: repository ${audit.historicalRepoOnlyCount}, hosted ${audit.historicalHostedOnlyCount}`);
    console.log(`Post-cutover holes before hosted head: ${audit.holesBeforeHostedHead.length}`);
    console.log(`Hosted-only post-cutover changes: ${audit.unknownHostedPostCutover.length}`);
    console.log(`Timestamp/name mismatches: ${audit.nameMismatches.length}; malformed/duplicate entries: ${audit.errors.length}`);
    console.log(`Newer repository candidates: ${audit.pendingAfterHostedHead.length}`);
    for (const f of audit.holesBeforeHostedHead) console.error(`UNAPPLIED HOLE: ${f.filename}`);
    for (const f of audit.unknownHostedPostCutover) console.error(`HOSTED-ONLY: ${f.version} ${f.name ?? "unnamed"}`);
    for (const issue of audit.nameMismatches) console.error(`NAME MISMATCH: ${issue.version} (${issue.repositoryName} != ${issue.hostedName})`);
    for (const error of audit.errors) console.error(`INVALID EVIDENCE: ${error}`);
    if (shaMismatch) console.error(`SHA MISMATCH: checkout ${candidateSha} != expected ${expectedSha}`);
  }

  if (shaMismatch || (args.includes("--require-reconciled") && !audit.historyReconciled)) process.exit(1);
} catch (error) {
  console.error(`FAIL CLOSED: could not verify hosted migration history: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
