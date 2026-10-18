import {
  V3_SHARED_PHYSICAL_TABLE_CONTRACTS,
  validateV3PhysicalTableOwnership,
} from "../src/lib/v3-s15-physical-owner-audit";
import { V3_VERIFIED_DOMAIN_TABLES } from "../src/lib/v3-system-physical-audit";

const requireZero = process.argv.includes("--require-zero");
const json = process.argv.includes("--json");
const findings = validateV3PhysicalTableOwnership();

const physicalTables = new Set(Object.values(V3_VERIFIED_DOMAIN_TABLES).flat());
const domainAssignments = Object.values(V3_VERIFIED_DOMAIN_TABLES).reduce(
  (sum, tables) => sum + tables.length,
  0,
);

const report = {
  schemaVersion: 1,
  zeroOwnershipConflicts: findings.length === 0,
  inventory: {
    domains: Object.keys(V3_VERIFIED_DOMAIN_TABLES).length,
    uniquePhysicalTables: physicalTables.size,
    domainTableAssignments: domainAssignments,
    explicitlySharedTables: V3_SHARED_PHYSICAL_TABLE_CONTRACTS.length,
  },
  sharedTables: V3_SHARED_PHYSICAL_TABLE_CONTRACTS.map((contract) => ({
    table: contract.table,
    owners: [...contract.owners],
    authority: contract.authority,
    reason: contract.reason,
  })),
  findings,
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    `S15 physical ownership: ${report.zeroOwnershipConflicts ? "ZERO CONFLICTS" : "NOT READY"}\n`,
  );
  process.stdout.write(
    `${report.inventory.uniquePhysicalTables} verified tables, ` +
      `${report.inventory.explicitlySharedTables} explicit shared boundaries.\n`,
  );
  if (findings.length) process.stdout.write(`Findings (${findings.length}):\n- ${findings.join("\n- ")}\n`);
}

if (requireZero && findings.length) process.exit(1);
