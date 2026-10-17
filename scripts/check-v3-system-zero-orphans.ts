import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  V3_SYSTEM_EDGE_FUNCTION_REGISTRY,
  V3_SYSTEM_INTEGRATION_REGISTRY,
  V3_SYSTEM_SCHEDULED_JOB_REGISTRY,
  validateV3SystemZeroOrphans,
} from "../src/lib/v3-system-zero-orphan-registry";

const root = process.cwd();
const integrationsRoot = resolve(root, "src/integrations/v3");
const functionsRoot = resolve(root, "supabase/functions");
const migrationsRoot = resolve(root, "supabase/migrations");

const integrationPaths = readdirSync(integrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => `src/integrations/v3/${entry.name}`)
  .sort();

const edgeFunctionNames = readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .sort();

const scheduledJobNames = new Set<string>();
for (const name of readdirSync(migrationsRoot).filter((name) => name.endsWith(".sql")).sort()) {
  const source = readFileSync(resolve(migrationsRoot, name), "utf8");
  for (const match of source.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)) {
    scheduledJobNames.add(match[1]);
  }
}

const failures = validateV3SystemZeroOrphans({
  integrationPaths,
  edgeFunctionNames,
  scheduledJobNames: [...scheduledJobNames].sort(),
});

for (const job of V3_SYSTEM_SCHEDULED_JOB_REGISTRY) {
  const source = readFileSync(resolve(root, job.evidence), "utf8");
  if (!source.includes(`'${job.name}'`) || !source.includes("cron.schedule")) {
    failures.push(`scheduled job evidence drifted: ${job.name} -> ${job.evidence}`);
  }
}

if (failures.length) {
  console.error("System V3 S15 zero-orphan audit failed.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nEvery discovered System behavior needs one explicit owner before release.");
  process.exit(1);
}

console.log(
  [
    "System V3 S15 zero-orphan audit passed",
    `integrations=${V3_SYSTEM_INTEGRATION_REGISTRY.length}`,
    `edgeFunctions=${V3_SYSTEM_EDGE_FUNCTION_REGISTRY.length}`,
    `scheduledJobs=${V3_SYSTEM_SCHEDULED_JOB_REGISTRY.length}`,
  ].join(" · "),
);
