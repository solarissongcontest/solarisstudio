import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { auditV3S13MigrationAdoption } from "../src/lib/v3-s13-migration-adoption-audit";

const FRAMEWORK_VERSION = "20261016234500";
const root = process.cwd();
const migrationsRoot = resolve(root, "supabase/migrations");
const requireClean = process.argv.includes("--require-clean");
const json = process.argv.includes("--json");

const migrations = readdirSync(migrationsRoot)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => {
    const version = name.split("_", 1)[0] ?? "";
    return /^\d{14}$/.test(version) && version > FRAMEWORK_VERSION;
  })
  .sort()
  .map((name) => ({
    path: `supabase/migrations/${name}`,
    source: readFileSync(resolve(migrationsRoot, name), "utf8"),
  }));

const report = auditV3S13MigrationAdoption(migrations);

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    `S13 migration adoption: ${report.migrationCount} post-framework migrations, ` +
      `${report.adoptedCount} contract-backed, ${report.exemptCount} explicitly exempt, ` +
      `${report.findingCount} findings.\n`,
  );
  for (const finding of report.findings) {
    process.stdout.write(
      `- ${finding.finding}: ${finding.path}` +
        `${finding.risks.length ? ` [${finding.risks.join(", ")}]` : ""}\n`,
    );
  }
}

if (requireClean && report.findingCount > 0) process.exit(1);
