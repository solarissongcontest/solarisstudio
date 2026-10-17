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
