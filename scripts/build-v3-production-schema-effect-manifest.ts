#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  auditV3ProductionMigrationFrontier,
  type HostedMigration,
} from "../src/lib/v3-production-migration-frontier";
import {
  V3_PRODUCTION_SCHEMA_EFFECT_MATRIX,
  V3_PRODUCTION_PENDING_MIGRATION_LANES,
} from "../src/lib/v3-production-schema-effect-matrix";
import type { V3SchemaEffectManifest } from "../src/lib/v3-production-schema-effect-reconciliation";

const historyPath = process.argv[2];
if (!historyPath) throw new Error("Usage: build-v3-production-schema-effect-manifest.ts <remote-history.json> [output.json]");
const root = resolve(import.meta.dir, "..");
const source = JSON.parse(readFileSync(resolve(historyPath), "utf8")) as
  | { migrations: HostedMigration[] }
  | HostedMigration[];
const hosted = Array.isArray(source) ? source : source.migrations;
const frontier = auditV3ProductionMigrationFrontier(readdirSync(resolve(root, "supabase/migrations")), hosted);
const byFilename = new Map(V3_PRODUCTION_SCHEMA_EFFECT_MATRIX.map((entry) => [entry.filename, entry]));
const missingMatrix = frontier.holesBeforeHostedHead
  .filter((migration) => !byFilename.has(migration.filename))
  .map((migration) => migration.filename);
if (missingMatrix.length) throw new Error(`No effect classification for: ${missingMatrix.join(", ")}`);
const matrixExtra = V3_PRODUCTION_SCHEMA_EFFECT_MATRIX
  .filter((entry) => !frontier.holesBeforeHostedHead.some((migration) => migration.filename === entry.filename))
  .map((entry) => entry.filename);
if (matrixExtra.length) throw new Error(`Effect matrix contains non-hole files: ${matrixExtra.join(", ")}`);
const pendingLaneFiles = Object.values(V3_PRODUCTION_PENDING_MIGRATION_LANES).flat();
const pendingLaneSet = new Set(pendingLaneFiles);
const pendingMissing = frontier.pendingAfterHostedHead
  .filter((migration) => !pendingLaneSet.has(migration.filename))
  .map((migration) => migration.filename);
if (pendingMissing.length) throw new Error(`Pending migration has no dependency lane: ${pendingMissing.join(", ")}`);
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const manifest: V3SchemaEffectManifest = {
  schemaVersion: 1,
  candidateSha,
  hostedHead: frontier.hostedHead ?? "",
  bootstrapCutover: frontier.bootstrapCutover,
  repositoryCount: frontier.repositoryCount,
  hostedCount: frontier.hostedCount,
  entries: frontier.holesBeforeHostedHead.map((migration) => ({
    version: migration.version,
    filename: migration.filename,
    ...byFilename.get(migration.filename)!,
    historyAction: "preserve" as const,
  })),
  pendingVersions: frontier.pendingAfterHostedHead.map((migration) => migration.version),
};
const output = process.argv[3];
if (output) writeFileSync(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`);
else console.log(JSON.stringify(manifest, null, 2));
