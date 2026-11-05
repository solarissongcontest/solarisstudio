#!/usr/bin/env tsx
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { auditV3S13MigrationAdoption } from "../src/lib/v3-s13-migration-adoption-audit";
import { auditV3S13MigrationVersions } from "../src/lib/v3-s13-migration-versions";
import { V3_S13_REVIEWED_MIGRATION_EXEMPTIONS } from "../src/lib/v3-s13-reviewed-migration-exemptions";

export const V3_S13_FRAMEWORK_VERSION = "20261019111000";
const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const requireClean = process.argv.includes("--require-clean");

function migrationVersion(filename: string) {
  const match = /^(\d{14})_/.exec(filename);
  return match?.[1] ?? null;
}

const sqlFilenames = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"));
const versions = auditV3S13MigrationVersions(sqlFilenames);

const migrations = sqlFilenames
  .filter((filename) => {
    const version = migrationVersion(filename);
    return version !== null && version > V3_S13_FRAMEWORK_VERSION;
  })
  .sort()
  .map((filename) => ({
    path: `supabase/migrations/${filename}`,
    source: readFileSync(resolve(migrationsDir, filename), "utf8"),
  }));

const report = auditV3S13MigrationAdoption(
  migrations,
  V3_S13_REVIEWED_MIGRATION_EXEMPTIONS,
);

console.log(
  JSON.stringify(
    {
      frameworkVersion: V3_S13_FRAMEWORK_VERSION,
      migrationCount: report.migrationCount,
      adoptedCount: report.adoptedCount,
      exemptCount: report.exemptCount,
      highRiskCount: report.highRiskCount,
      findingCount: report.findingCount,
      exemptionIssueCount: report.exemptionIssueCount,
      clean: report.clean && versions.clean,
      migrationVersionFilesChecked: versions.filesChecked,
      migrationVersionIssueCount: versions.issues.length,
      migrationVersionIssues: versions.issues,
      findings: report.findings,
      exemptionIssues: report.exemptionIssues,
    },
    null,
    2,
  ),
);

if (requireClean && !report.clean) process.exit(1);
if (requireClean && !versions.clean) process.exit(1);
