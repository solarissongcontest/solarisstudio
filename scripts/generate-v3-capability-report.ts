import {
  V3_API_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "../src/lib/v3-capability-registry";
import {
  V3_NOTIFICATION_CATEGORY_REGISTRY,
  V3_NOTIFICATION_PROVIDER_REGISTRY,
} from "../src/lib/v3-notification-provider-registry";
import { V3_SEARCH_PROVIDER_REGISTRY } from "../src/lib/v3-search-provider-registry";
import {
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_DOMAIN_REGISTRY,
} from "../src/lib/v3-system-domain-registry";
import {
  V3_SYSTEM_PHYSICAL_AUDIT_SOURCE,
  V3_VERIFIED_DOMAIN_TABLES,
} from "../src/lib/v3-system-physical-audit";

function escapeCell(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const publicStatus = countBy(V3_PUBLIC_CAPABILITIES, (item) => item.specificationStatus);
const publicClassification = countBy(V3_PUBLIC_CAPABILITIES, (item) => item.classification);
const organizerStatus = countBy(V3_ORGANIZER_CAPABILITY_REGISTRY, (item) => item.migrationStatus);
const organizerClassification = countBy(
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  (item) => item.classification,
);
const pendingSystem = V3_SYSTEM_DOMAIN_REGISTRY.filter(
  (domain) => domain.physicalAuditStatus === "pending",
).sort((a, b) => a.domain.localeCompare(b.domain));
const unresolvedPublic = V3_PUBLIC_CAPABILITIES.filter((item) =>
  ["discovered", "mapped", "specified", "building"].includes(item.specificationStatus),
).sort((a, b) => a.id.localeCompare(b.id));
const notificationDeliveryClasses = countBy(
  V3_NOTIFICATION_CATEGORY_REGISTRY,
  (item) => item.deliveryClass,
);

const lines = [
  "# Solaris Studio V3 capability report",
  "",
  "> Deterministically generated from the repository registries by `bun run report:v3-registry`.",
  "> It is evidence of current ownership and migration state, not a claim that V3 is complete.",
  "",
  "## Inventory",
  "",
  `- Public/participant capabilities: **${V3_PUBLIC_CAPABILITIES.length}**`,
  `- Organizer capabilities: **${V3_ORGANIZER_CAPABILITY_REGISTRY.length}**`,
  `- API routes: **${V3_API_CAPABILITY_REGISTRY.length}**`,
  `- Public Search providers: **${V3_SEARCH_PROVIDER_REGISTRY.length}**`,
  `- Notification categories: **${V3_NOTIFICATION_CATEGORY_REGISTRY.length}**`,
  `- Notification producer families: **${V3_NOTIFICATION_PROVIDER_REGISTRY.length}**`,
  `- System domains: **${V3_SYSTEM_DOMAIN_REGISTRY.length}**`,
  `- Required System concepts with owners: **${V3_REQUIRED_SYSTEM_CONCEPTS.length}**`,
  `- Domains with verified physical Supabase tables: **${Object.keys(V3_VERIFIED_DOMAIN_TABLES).length}**`,
  `- System domains still pending physical table ownership audit: **${pendingSystem.length}**`,
  "",
  "## Public migration state",
  "",
  "### By status",
  "",
  ...publicStatus.map(([status, count]) => `- ${status}: ${count}`),
  "",
  "### By classification",
  "",
  ...publicClassification.map(([classification, count]) => `- ${classification}: ${count}`),
  "",
  "### Not yet at parity/cutover/retired",
  "",
  "| Capability | Classification | Status | Target | Acceptance scenario |",
  "| --- | --- | --- | --- | --- |",
  ...unresolvedPublic.map(
    (item) =>
      `| ${escapeCell(item.id)} | ${escapeCell(item.classification)} | ${escapeCell(item.specificationStatus)} | ${escapeCell(item.targetRoute)} | ${escapeCell(item.acceptanceScenarioId)} |`,
  ),
  "",
  "## Organizer migration state",
  "",
  "### By status",
  "",
  ...organizerStatus.map(([status, count]) => `- ${status}: ${count}`),
  "",
  "### By classification",
  "",
  ...organizerClassification.map(([classification, count]) => `- ${classification}: ${count}`),
  "",
  "| Capability | Classification | Status | Target domain | Target route | Owner capability |",
  "| --- | --- | --- | --- | --- | --- |",
  ...[...V3_ORGANIZER_CAPABILITY_REGISTRY]
    .sort((a, b) => a.legacyId.localeCompare(b.legacyId))
    .map(
      (item) =>
        `| ${escapeCell(item.legacyId)} | ${escapeCell(item.classification)} | ${escapeCell(item.migrationStatus)} | ${escapeCell(item.targetDomain)} | ${escapeCell(item.targetRoute)} | ${escapeCell(item.ownerCapability)} |`,
    ),
  "",
  "## API ownership",
  "",
  "| Route | Methods | Owner | Audience | Mutation | Risk tier |",
  "| --- | --- | --- | --- | --- | --- |",
  ...V3_API_CAPABILITY_REGISTRY.map(
    (item) =>
      `| ${escapeCell(item.route)} | ${escapeCell(item.methods.join(", "))} | ${escapeCell(item.ownerDomain)} | ${escapeCell(item.audience)} | ${item.mutation ? "yes" : "no"} | ${item.riskTier} |`,
  ),
  "",
  "## Public Search ownership",
  "",
  "| Provider | Mode | Domain owner | Capability | Result groups |",
  "| --- | --- | --- | --- | --- |",
  ...V3_SEARCH_PROVIDER_REGISTRY.map(
    (item) =>
      `| ${escapeCell(item.id)} | ${escapeCell(item.mode)} | ${escapeCell(item.ownerDomain)} | ${escapeCell(item.capabilityId)} | ${escapeCell(item.resultGroups.join(", "))} |`,
  ),
  "",
  "## Notification ownership",
  "",
  "### Categories by delivery class",
  "",
  ...notificationDeliveryClasses.map(([deliveryClass, count]) => `- ${deliveryClass}: ${count}`),
  "",
  "| Category | Domain owner | Class | Preference controlled | Default route |",
  "| --- | --- | --- | --- | --- |",
  ...V3_NOTIFICATION_CATEGORY_REGISTRY.map(
    (item) =>
      `| ${escapeCell(item.category)} | ${escapeCell(item.ownerDomain)} | ${escapeCell(item.deliveryClass)} | ${item.preferenceControlled ? "yes" : "no"} | ${escapeCell(item.defaultRoute)} |`,
  ),
  "",
  "| Producer | Domain owner | Categories | Event types | Action required |",
  "| --- | --- | --- | --- | --- |",
  ...V3_NOTIFICATION_PROVIDER_REGISTRY.map(
    (item) =>
      `| ${escapeCell(item.id)} | ${escapeCell(item.ownerDomain)} | ${escapeCell(item.categories.join(", "))} | ${escapeCell(item.eventTypes.join(", "))} | ${item.actionRequired ? "yes" : "no"} |`,
  ),
  "",
  "## System physical ownership",
  "",
  `Read-only table/schema evidence: **${escapeCell(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.projectId)}**, inspected **${escapeCell(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.inspectedAt)}** via ${escapeCell(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.method)}.`,
  "",
  "| Domain | Table-audit status | Primary physical tables |",
  "| --- | --- | --- |",
  ...[...V3_SYSTEM_DOMAIN_REGISTRY]
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .map(
      (domain) =>
        `| ${escapeCell(domain.domain)} | ${escapeCell(domain.physicalAuditStatus)} | ${escapeCell(domain.primaryTables.join(", ") || "pending")} |`,
    ),
  "",
  "## System physical-table audit backlog",
  "",
  pendingSystem.length
    ? "These domains have a canonical logical owner but their physical Supabase table ownership is not yet certified in S1:"
    : "No System domain remains pending physical table ownership audit.",
  "",
  ...pendingSystem.map(
    (domain) =>
      `- **${escapeCell(domain.domain)}** — ${escapeCell(domain.canonicalStore)}; evidence: ${escapeCell(domain.ownershipEvidence.join(", "))}`,
  ),
  "",
  "## Release interpretation",
  "",
  "A green registry guard means the currently scanned discovery sources are mapped and there are no known route/API/flag/Search/notification/System ownership orphans. It does **not** mean every capability has reached parity, every RPC/command/security boundary has been physically audited, or Solaris V3 is release-certified.",
  "",
].join("\n");

process.stdout.write(lines);
