import {
  V3_API_CAPABILITY_REGISTRY,
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
  validateV3DomainConsequenceRegistry,
  validateV3WorkflowDependencyRegistry,
} from "../src/lib/v3-capability-registry";
import {
  V3_NOTIFICATION_CATEGORY_REGISTRY,
  V3_NOTIFICATION_PROVIDER_REGISTRY,
} from "../src/lib/v3-notification-provider-registry";
import { V3_SEARCH_PROVIDER_REGISTRY } from "../src/lib/v3-search-provider-registry";

const requireZero = process.argv.includes("--require-zero");
const findings: string[] = [];
const domains = new Set(V3_SYSTEM_DOMAIN_REGISTRY.map((item) => item.domain));
const ownerMap = V3_SYSTEM_CONCEPT_OWNER as Record<string, string>;

for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) {
  if (!ownerMap[concept]) findings.push(`SYSTEM_CONCEPT_ORPHAN ${concept}`);
}
for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
  if (domain.physicalAuditStatus === "pending") findings.push(`PHYSICAL_OWNER_PENDING ${domain.domain}`);
}
for (const issue of validateV3DomainConsequenceRegistry()) findings.push(`CONSEQUENCE_ORPHAN ${issue}`);
for (const issue of validateV3WorkflowDependencyRegistry()) findings.push(`WORKFLOW_ORPHAN ${issue}`);

for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
  if (!domains.has(consequence.ownerDomain)) {
    findings.push(`CONSEQUENCE_OWNER_ORPHAN ${consequence.eventType} -> ${consequence.ownerDomain}`);
  }
}
for (const api of V3_API_CAPABILITY_REGISTRY) {
  if (!domains.has(api.ownerDomain)) findings.push(`API_OWNER_ORPHAN ${api.route} -> ${api.ownerDomain}`);
}
for (const provider of V3_SEARCH_PROVIDER_REGISTRY) {
  if (!domains.has(provider.ownerDomain)) findings.push(`SEARCH_OWNER_ORPHAN ${provider.id} -> ${provider.ownerDomain}`);
}
for (const category of V3_NOTIFICATION_CATEGORY_REGISTRY) {
  if (!domains.has(category.ownerDomain)) {
    findings.push(`NOTIFICATION_CATEGORY_OWNER_ORPHAN ${category.category} -> ${category.ownerDomain}`);
  }
}
for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
  if (!domains.has(provider.ownerDomain)) {
    findings.push(`NOTIFICATION_PROVIDER_OWNER_ORPHAN ${provider.id} -> ${provider.ownerDomain}`);
  }
}

for (const capability of V3_PUBLIC_CAPABILITIES) {
  if (!["cutover", "retired"].includes(capability.specificationStatus)) {
    findings.push(`PUBLIC_CUTOVER_UNRESOLVED ${capability.id}:${capability.specificationStatus}`);
  }
}
for (const capability of V3_ORGANIZER_CAPABILITY_REGISTRY) {
  if (!["cutover", "retired"].includes(capability.migrationStatus)) {
    findings.push(`ORGANIZER_CUTOVER_UNRESOLVED ${capability.legacyId}:${capability.migrationStatus}`);
  }
}

const report = {
  schemaVersion: 1,
  zeroOrphans: findings.length === 0,
  inventory: {
    systemDomains: V3_SYSTEM_DOMAIN_REGISTRY.length,
    systemConcepts: V3_REQUIRED_SYSTEM_CONCEPTS.length,
    domainConsequences: V3_DOMAIN_CONSEQUENCE_REGISTRY.length,
    apiCapabilities: V3_API_CAPABILITY_REGISTRY.length,
    searchProviders: V3_SEARCH_PROVIDER_REGISTRY.length,
    notificationCategories: V3_NOTIFICATION_CATEGORY_REGISTRY.length,
    notificationProviders: V3_NOTIFICATION_PROVIDER_REGISTRY.length,
    publicCapabilities: V3_PUBLIC_CAPABILITIES.length,
    organizerCapabilities: V3_ORGANIZER_CAPABILITY_REGISTRY.length,
  },
  findings,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`S15 zero-orphan readiness: ${report.zeroOrphans ? "ZERO ORPHANS" : "NOT READY"}\n`);
  if (findings.length) process.stdout.write(`Findings (${findings.length}):\n- ${findings.join("\n- ")}\n`);
}

if (requireZero && findings.length) process.exit(1);
