#!/usr/bin/env bun
/**
 * Validate operator-generated, read-only schema-effect reconciliation.
 *
 * This consumes only an offline migration-history audit and a sanitized local
 * effect manifest. It never connects to Supabase and never authorizes hosted SQL.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  auditV3ProductionMigrationFrontier,
  type HostedMigration,
} from "../src/lib/v3-production-migration-frontier";
import {
  reconcileV3ProductionSchemaEffects,
  type V3SchemaEffectManifest,
} from "../src/lib/v3-production-schema-effect-reconciliation";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1] ?? null;
};
const historyPath = value("--remote-history");
const manifestPath = value("--manifest");
if (!historyPath || !manifestPath) {
  console.error("FAIL CLOSED: provide --remote-history <JSON> and --manifest <JSON>");
  process.exit(2);
}

try {
  const root = resolve(import.meta.dir, "..");
  const history = JSON.parse(readFileSync(resolve(historyPath), "utf8")) as
    | { migrations: HostedMigration[] }
    | HostedMigration[];
  const hosted = Array.isArray(history) ? history : history.migrations;
  if (!Array.isArray(hosted)) throw new Error("Hosted evidence must be a JSON array or {migrations: array}");
  const files = readdirSync(resolve(root, "supabase/migrations"));
  const frontier = auditV3ProductionMigrationFrontier(files, hosted);
  const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as V3SchemaEffectManifest;
  const report = reconcileV3ProductionSchemaEffects({ candidateSha, frontier, manifest });
  const output = { ...report, frontier };
  if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`V3 schema-effect reconciliation (${candidateSha}): ${report.manifestValid ? "RECONCILED" : "BLOCKED"}`);
    console.log(`Audited holes: ${report.reconciledVersions.length}; pending repository migrations: ${report.pendingVersions.length}`);
    for (const error of report.errors) console.error(`BLOCKER: ${error}`);
  }
  // Effect reconciliation deliberately runs while the metadata frontier still
  // reports historical holes; forward-only adoption must close those holes later.
  if (!report.manifestValid) process.exit(1);
} catch (error) {
  console.error(`FAIL CLOSED: could not validate schema-effect evidence: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
