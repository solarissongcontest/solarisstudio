import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  V3_S13_FRAMEWORK_MIGRATION,
  V3_S13_FRAMEWORK_VERSION,
  V3_S13_REVIEWED_EXEMPTIONS,
  auditV3S13MigrationAdoption,
  validateV3S13ReviewedExemptions,
} from "../src/lib/v3-s13-migration-adoption-audit";

const root = process.cwd();
const migrationsRoot = resolve(root, "supabase/migrations");
const requireClean = process.argv.includes("--require-clean");
const requireSafe = process.argv.includes("--require-safe");
const json = process.argv.includes("--json");

const migrationNames = readdirSync(migrationsRoot)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!migrationNames.includes(V3_S13_FRAMEWORK_MIGRATION)) {
  throw new Error(
    `Missing canonical S13 framework migration: ${V3_S13_FRAMEWORK_MIGRATION}`,
  );
}

const migrations = migrationNames
  .filter((name) => {
    const version = name.split("_", 1)[0] ?? "";
    return /^\d{14}$/.test(version) && version > V3_S13_FRAMEWORK_VERSION;
  })
  .map((name) => ({
    path: `supabase/migrations/${name}`,
    source: readFileSync(resolve(migrationsRoot, name), "utf8"),
  }));

const exemptionErrors = validateV3S13ReviewedExemptions(
  migrations,
  V3_S13_REVIEWED_EXEMPTIONS,
);
if (exemptionErrors.length > 0) {
  for (const error of exemptionErrors) process.stderr.write(`S13 exemption error: ${error}\n`);
  process.exit(1);
}

const report = auditV3S13MigrationAdoption(
  migrations,
  V3_S13_REVIEWED_EXEMPTIONS,
);

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    `S13 migration adoption: ${report.migrationCount} post-framework migrations, ` +
      `${report.adoptedCount} contract-backed, ${report.exemptCount} explicitly/reviewed exempt, ` +
      `${report.findingCount} findings (${report.highRiskFindingCount} high-risk).\n`,
  );
  for (const finding of report.findings) {
    process.stdout.write(
      `- ${finding.finding}: ${finding.path}` +
        `${finding.risks.length ? ` [${finding.risks.join(", ")}]` : ""}\n`,
    );
  }
}

if (requireClean && report.findingCount > 0) process.exit(1);
if (requireSafe && report.highRiskFindingCount > 0) process.exit(1);
