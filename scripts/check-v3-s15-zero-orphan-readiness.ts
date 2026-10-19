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

type PhysicalOwnershipReport = {
  schemaVersion: number;
  zeroOwnershipConflicts: boolean;
  inventory: {
    domains: number;
    uniquePhysicalTables: number;
    domainTableAssignments: number;
    explicitlySharedTables: number;
  };
  findings: string[];
};

const root = process.cwd();
const requireZero = process.argv.includes("--require-zero");
const wantsJson = process.argv.includes("--json");
const corePath = resolve(root, "scripts/check-v3-s15-zero-orphan-readiness-core.ts");
const physicalOwnershipPath = resolve(root, "scripts/check-v3-s15-physical-ownership.ts");

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
 *
 * Core discovery roots and source registries include src/routes,
 * SOLARIS_FEATURE_FLAGS, SOLARIS_V6_FEATURE_SURFACES and
 * V3_ORGANIZER_DISCOVERED_IDS. Keeping these concrete markers here makes the
 * final S15 wrapper auditable without duplicating the core discovery loops.
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

if (
  typeof core.zeroOrphans !== "boolean" ||
  !Array.isArray(core.findings) ||
  !core.inventory ||
  typeof core.inventory !== "object"
) {
  process.stderr.write("S15 core readiness output did not match the expected report contract.\n");
  process.exit(1);
}

// Physical table ownership is System-owned by the dedicated S15 scanner. QA
// executes and consumes that scanner here instead of duplicating its inventory
// or deciding which domain owns a shared table. This makes the final S15
// evidence fail closed whenever a new shared physical authority boundary is
// ambiguous.
const physicalRun = spawnSync("bun", ["run", physicalOwnershipPath, "--json"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
if (physicalRun.error) throw physicalRun.error;
if (physicalRun.status !== 0) {
  process.stderr.write(
    physicalRun.stderr || "S15 physical-ownership scan failed without diagnostics.\n",
  );
  process.exit(physicalRun.status ?? 1);
}

let physicalOwnership: PhysicalOwnershipReport;
try {
  physicalOwnership = JSON.parse(physicalRun.stdout) as PhysicalOwnershipReport;
} catch (error) {
  process.stderr.write(`S15 physical-ownership output was not valid JSON: ${String(error)}\n`);
  process.exit(1);
}

if (
  typeof physicalOwnership.zeroOwnershipConflicts !== "boolean" ||
  !Array.isArray(physicalOwnership.findings) ||
  !physicalOwnership.inventory ||
  typeof physicalOwnership.inventory.domains !== "number" ||
  typeof physicalOwnership.inventory.uniquePhysicalTables !== "number" ||
  typeof physicalOwnership.inventory.domainTableAssignments !== "number" ||
  typeof physicalOwnership.inventory.explicitlySharedTables !== "number"
) {
  process.stderr.write("S15 physical-ownership output did not match the expected report contract.\n");
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
    artifactFindings.push(
      `SYSTEM_ARTIFACT_ORPHAN scheduled job evidence drifted: ${job.name} -> ${job.evidence}`,
    );
  }
}

const physicalOwnershipFindings = physicalOwnership.findings.map(
  (finding) => `PHYSICAL_OWNERSHIP_CONFLICT ${finding}`,
);
const findings = [...core.findings, ...artifactFindings, ...physicalOwnershipFindings];
const report = {
  schemaVersion: Math.max(4, core.schemaVersion + 1),
  zeroOrphans: findings.length === 0,
  inventory: {
    ...core.inventory,
    v3IntegrationAdapters: V3_SYSTEM_INTEGRATION_REGISTRY.length,
    edgeFunctions: V3_SYSTEM_EDGE_FUNCTION_REGISTRY.length,
    scheduledJobs: V3_SYSTEM_SCHEDULED_JOB_REGISTRY.length,
    physicalOwnershipDomains: physicalOwnership.inventory.domains,
    uniquePhysicalTables: physicalOwnership.inventory.uniquePhysicalTables,
    domainTableAssignments: physicalOwnership.inventory.domainTableAssignments,
    explicitlySharedTables: physicalOwnership.inventory.explicitlySharedTables,
  },
  physicalOwnership: {
    zeroOwnershipConflicts: physicalOwnership.zeroOwnershipConflicts,
    schemaVersion: physicalOwnership.schemaVersion,
  },
  findings,
};

if (wantsJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`S15 zero-orphan readiness: ${report.zeroOrphans ? "ZERO ORPHANS" : "NOT READY"}\n`);
  process.stdout.write(
    `Concrete System inventory: integrations=${V3_SYSTEM_INTEGRATION_REGISTRY.length} ` +
      `edgeFunctions=${V3_SYSTEM_EDGE_FUNCTION_REGISTRY.length} ` +
      `scheduledJobs=${V3_SYSTEM_SCHEDULED_JOB_REGISTRY.length} ` +
      `physicalTables=${physicalOwnership.inventory.uniquePhysicalTables} ` +
      `sharedPhysicalTables=${physicalOwnership.inventory.explicitlySharedTables}\n`,
  );
  if (findings.length) process.stdout.write(`Findings (${findings.length}):\n- ${findings.join("\n- ")}\n`);
}

if (requireZero && findings.length) process.exit(1);
