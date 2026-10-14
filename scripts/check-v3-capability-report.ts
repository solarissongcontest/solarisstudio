import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  PUBLIC_V3_CAPABILITIES,
  type PublicCapabilityMigration,
} from "../docs/v3/public-capability-registry";

const REPORT_PATH = join(process.cwd(), "docs/v3/public-capability-report.md");

function countBy<T extends string>(values: readonly T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function formatCounts<T extends string>(counts: Map<T, number>) {
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `- **${key}:** ${count}`)
    .join("\n");
}

function escapeTable(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function row(capability: PublicCapabilityMigration) {
  return [
    capability.id,
    capability.classification,
    capability.targetArea,
    capability.targetRoute,
    capability.specificationStatus,
    capability.acceptanceScenarioId,
  ]
    .map((value) => escapeTable(String(value)))
    .join(" | ");
}

export function renderPublicCapabilityReport() {
  const classificationCounts = countBy(PUBLIC_V3_CAPABILITIES.map((item) => item.classification));
  const statusCounts = countBy(PUBLIC_V3_CAPABILITIES.map((item) => item.specificationStatus));
  const areaCounts = countBy(PUBLIC_V3_CAPABILITIES.map((item) => item.targetArea));

  const rows = [...PUBLIC_V3_CAPABILITIES]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((capability) => `| ${row(capability)} |`)
    .join("\n");

  return `# Solaris Studio V3 Public capability report

> Generated from \`docs/v3/public-capability-registry.ts\`. Do not edit this report by hand. Run \`bun run generate:v3-registry-report\` after changing the registry.

This is a migration-inventory snapshot, **not a V3 release certificate**. Repository coverage is independently enforced by \`bun run check:v3-registry\`; exact-SHA release certification still requires the complete V3 gates and rehearsals.

## Snapshot

- **Registered Public capabilities:** ${PUBLIC_V3_CAPABILITIES.length}
- **Unknown is not a valid registry classification:** enforced by the registry type
- **Route/navigation/feature/notification/PWA/sitemap coverage:** enforced separately by the registry guard

### Classification counts

${formatCounts(classificationCounts)}

### Specification status counts

${formatCounts(statusCounts)}

### Target-area counts

${formatCounts(areaCounts)}

## Capability migration table

| Capability | Classification | Target area | Target route | Status | Acceptance scenario |
| --- | --- | --- | --- | --- | --- |
${rows}

## Release interpretation

A capability reaching \`parity\` means its migration row has implementation/parity evidence suitable for the capability programme. It does **not** by itself permit legacy removal or a V3-complete claim. Legacy cutover still requires parity evidence, production-safe migration, zero uncovered capability signals, recovery/rehearsal evidence, and exact-final-SHA certification.
`;
}

const expected = renderPublicCapabilityReport();
const write = process.argv.includes("--write");

if (write) {
  writeFileSync(REPORT_PATH, expected, "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
} else {
  let current = "";
  try {
    current = readFileSync(REPORT_PATH, "utf8");
  } catch {
    console.error("Public V3 capability report is missing. Run bun run generate:v3-registry-report.");
    process.exit(1);
  }

  if (current !== expected) {
    console.error("Public V3 capability report is stale. Run bun run generate:v3-registry-report and commit the result.");
    process.exit(1);
  }

  console.log(`Public V3 capability report is current (${PUBLIC_V3_CAPABILITIES.length} capabilities).`);
}
