import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  V3_SYSTEM_EDGE_FUNCTION_REGISTRY,
  V3_SYSTEM_INTEGRATION_REGISTRY,
  V3_SYSTEM_SCHEDULED_JOB_REGISTRY,
  validateV3SystemZeroOrphans,
} from "../src/lib/v3-system-zero-orphan-registry";

type CoreReport = {
  schemaVersion: number;
  zeroOrphans: boolean;
  inventory: Record<string, number>;
  findings: string[];
};

const root = process.cwd();
const requireZero = process.argv.includes("--require-zero");
const wantsJson = process.argv.includes("--json");
const corePath = resolve(root, "scripts/check-v3-s15-zero-orphan-readiness-core.ts");

/**
 * Cross-system S15 discovery stays implemented in the core scanner so this
 * wrapper can add concrete repository artifacts without duplicating route,
 * capability, cutover, notification and System-domain discovery logic.
 *
 * Keep the delegated taxonomy visible here because this file is the final S15
 * release-evidence boundary. QA can therefore prove that final readiness still
 * covers every canonical discovery class even though the implementation is
 * split between the core scanner and this artifact scanner.
 *
 * Core finding classes include:
 * SYSTEM_CONCEPT_ORPHAN, PHYSICAL_OWNER_PENDING, CONSEQUENCE_ORPHAN,
 * WORKFLOW_ORPHAN, API_OWNER_ORPHAN, SEARCH_OWNER_ORPHAN,
 * NOTIFICATION_CATEGORY_OWNER_ORPHAN, NOTIFICATION_PROVIDER_OWNER_ORPHAN,
 * PUBLIC_CUTOVER_UNRESOLVED, ORGANIZER_CUTOVER_UNRESOLVED,
 * SYSTEM_COMMAND_ORPHAN, SYSTEM_EVENT_ORPHAN, SYSTEM_PROJECTION_ORPHAN,
 * SYSTEM_JOB_ORPHAN, PUBLIC_LEGACY_ALIAS_ORPHAN,
 * ORGANIZER_LEGACY_ALIAS_ORPHAN, RUNTIME_API_ROUTE_ORPHAN,
 * ORGANIZER_CONTROL_ROUTE_ORPHAN, PUBLIC_SURFACE_ROUTE_ORPHAN,
 * FEATURE_FLAG_ORPHAN, ORGANIZER_CONTROL_ORPHAN,
 * PUBLIC_SOURCE_SURFACE_ORPHAN, NOTIFICATION_DEEP_LINK_ORPHAN,
 * NOTIFICATION_DYNAMIC_DEEP_LINK_ORPHAN.
 *
 * Core inventory evidence includes runtimeRoutes, legacyAliases,
 * v3FeatureFlags, organizerControls, publicSourceSurfaces and
 * notificationDeepLinks.
 */
const coreRun = spawnSync(process.execPath, [corePath, "--json"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
if (coreRun.error) throw coreRun.error;
if (coreRun.status !== 0) {
  process.stderr.write(coreRun.stderr || "S15 core readiness scan failed without diagnostics.\n");
  process.exit(coreRun.status ?? 1);
}

let core: CoreReport;
try {
  core = JSON.parse(coreRun.stdout) as CoreReport;
} catch (error) {
  process.stderr.write(`S15 core readiness output was not valid JSON: ${String(error)}\n`);
  process.exit(1);
}

const integrationPaths = readdirSync(resolve(root, "src/integrations/v3"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => `src/integrations/v3/${entry.name}`)
  .sort();

const edgeFunctionNames = readdirSync(resolve(root, "supabase/functions"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .sort();

const scheduledJobNames = new Set<string>();
const migrationsRoot = resolve(root, "supabase/migrations");
for (const name of readdirSync(migrationsRoot).filter((item) => item.endsWith(".sql")).sort()) {
  const source = readFileSync(resolve(migrationsRoot, name), "utf8");
  for (const match of source.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)) {
    scheduledJobNames.add(match[1]);
  }
}

const artifactFindings = validateV3SystemZeroOrphans({
  integrationPaths,
  edgeFunctionNames,
  scheduledJobNames: [...scheduledJobNames].sort(),
}).map((finding) => `SYSTEM_ARTIFACT_ORPHAN ${finding}`);

for (const job of V3_SYSTEM_SCHEDULED_JOB_REGISTRY) {
  const source = readFileSync(resolve(root, job.evidence), "utf8");
  if (!source.includes(`'${job.name}'`) || !source.includes("cron.schedule")) {
    artifactFindings.push(`SYSTEM_ARTIFACT_ORPHAN scheduled job evidence drifted: ${job.name} -> ${job.evidence}`);
  }
}

const findings = [...core.findings, ...artifactFindings];
const report = {
  schemaVersion: Math.max(3, core.schemaVersion + 1),
  zeroOrphans: findings.length === 0,
  inventory: {
    ...core.inventory,
    v3IntegrationAdapters: V3_SYSTEM_INTEGRATION_REGISTRY.length,
    edgeFunctions: V3_SYSTEM_EDGE_FUNCTION_REGISTRY.length,
    scheduledJobs: V3_SYSTEM_SCHEDULED_JOB_REGISTRY.length,
  },
  findings,
};

if (wantsJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`S15 zero-orphan readiness: ${report.zeroOrphans ? "ZERO ORPHANS" : "NOT READY"}\n`);
  process.stdout.write(
    `Concrete System inventory: integrations=${V3_SYSTEM_INTEGRATION_REGISTRY.length} edgeFunctions=${V3_SYSTEM_EDGE_FUNCTION_REGISTRY.length} scheduledJobs=${V3_SYSTEM_SCHEDULED_JOB_REGISTRY.length}\n`,
  );
  if (findings.length) process.stdout.write(`Findings (${findings.length}):\n- ${findings.join("\n- ")}\n`);
}

if (requireZero && findings.length) process.exit(1);
