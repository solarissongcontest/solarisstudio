import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { SOLARIS_FEATURE_FLAGS } from "../src/lib/feature-flags";
import { SOLARIS_V6_FEATURE_SURFACES } from "../src/lib/solaris-v6-surface-registry";
import {
  V3_API_CAPABILITY_REGISTRY,
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CLASSIFICATION_BY_ID,
  V3_ORGANIZER_DISCOVERED_IDS,
  V3_ORGANIZER_FEATURE_FLAGS,
  V3_ORGANIZER_NON_CAPABILITY_ROUTES,
  V3_ORGANIZER_ROUTE_OWNERSHIP,
  V3_PUBLIC_CAPABILITIES,
  V3_PUBLIC_FEATURE_FLAGS,
  V3_PUBLIC_SOURCE_SURFACE_IDS,
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

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const full = resolve(path, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function setDiff(expected: Iterable<string>, actual: Iterable<string>) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: [...expectedSet].filter((item) => !actualSet.has(item)).sort(),
    extra: [...actualSet].filter((item) => !expectedSet.has(item)).sort(),
  };
}

function routeIdFromSource(source: string) {
  return source.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1] ?? null;
}

function publicPath(routeId: string) {
  if (routeId === "/_authenticated") return null;
  return routeId.replace(/^\/_authenticated(?=\/|$)/, "") || "/";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDynamicSegments(route: string) {
  return route.replace(/\$[A-Za-z][A-Za-z0-9_]*/g, ":param");
}

function normalizedPattern(pattern: string) {
  return pattern.replace(/:[A-Za-z][A-Za-z0-9_]*/g, ":param");
}

function routeMatches(pattern: string, route: string) {
  if (pattern === route) return true;
  if (!pattern.includes("*") && !pattern.includes(":")) return route.startsWith(`${pattern}/`);

  let expression = escapeRegex(pattern);
  expression = expression.replace(/\\\*/g, ".*");
  expression = expression.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "[^/]+");
  return new RegExp(`^${expression}$`).test(route);
}

function publicOwner(route: string) {
  const normalized = normalizeDynamicSegments(route);
  return (
    V3_PUBLIC_CAPABILITIES.find((item) =>
      [...item.legacyRoutes, item.targetRoute].some((pattern) =>
        routeMatches(normalizedPattern(pattern), normalized),
      ),
    )?.id ?? null
  );
}

function organizerOwner(route: string) {
  if (V3_ORGANIZER_NON_CAPABILITY_ROUTES.has(route)) return "organizer-non-capability";
  const normalized = normalizeDynamicSegments(route);
  const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) =>
    item.legacyRoutes.some((pattern) => routeMatches(normalizedPattern(pattern), normalized)),
  );
  if (capability) return capability.legacyId;
  return (
    V3_ORGANIZER_ROUTE_OWNERSHIP.find((item) =>
      routeMatches(normalizedPattern(item.routePattern), normalized),
    )?.ownerLegacyId ?? null
  );
}

function isOrganizerRoute(route: string) {
  return (
    route.startsWith("/admin") ||
    route.startsWith("/confirmations/admin") ||
    route.startsWith("/televoting/admin")
  );
}

function canonicalRouteOwner(route: string) {
  return isOrganizerRoute(route) ? organizerOwner(route) : publicOwner(route);
}

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

const commandOwners = new Map<string, Set<string>>();
const eventOwners = new Map<string, Set<string>>();
for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
  for (const command of domain.mutationCommands) {
    if (!command.trim()) findings.push(`SYSTEM_COMMAND_ORPHAN ${domain.domain}:<blank>`);
    const owners = commandOwners.get(command) ?? new Set<string>();
    owners.add(domain.domain);
    commandOwners.set(command, owners);
  }
  for (const event of domain.eventTypes) {
    if (!event.trim()) findings.push(`SYSTEM_EVENT_ORPHAN ${domain.domain}:<blank>`);
    const owners = eventOwners.get(event) ?? new Set<string>();
    owners.add(domain.domain);
    eventOwners.set(event, owners);
  }
  for (const projection of domain.projections) {
    if (!projection.trim()) findings.push(`SYSTEM_PROJECTION_ORPHAN ${domain.domain}:<blank>`);
  }
  for (const consumer of domain.backgroundConsumers) {
    if (!consumer.trim()) findings.push(`SYSTEM_JOB_ORPHAN ${domain.domain}:<blank>`);
  }
}
for (const [command, owners] of commandOwners) {
  if (owners.size > 1) findings.push(`SYSTEM_COMMAND_MULTIPLE_OWNERS ${command} -> ${[...owners].sort().join(",")}`);
}
for (const [event, owners] of eventOwners) {
  if (owners.size > 1) findings.push(`SYSTEM_EVENT_MULTIPLE_OWNERS ${event} -> ${[...owners].sort().join(",")}`);
}

for (const capability of V3_PUBLIC_CAPABILITIES) {
  if (!["cutover", "retired"].includes(capability.specificationStatus)) {
    findings.push(`PUBLIC_CUTOVER_UNRESOLVED ${capability.id}:${capability.specificationStatus}`);
  }
  for (const alias of capability.legacyRoutes) {
    if (!alias.startsWith("/")) findings.push(`PUBLIC_LEGACY_ALIAS_ORPHAN ${capability.id}:${alias}`);
  }
  if (!capability.targetRoute.startsWith("/")) {
    findings.push(`PUBLIC_TARGET_ROUTE_ORPHAN ${capability.id}:${capability.targetRoute}`);
  }
}
for (const capability of V3_ORGANIZER_CAPABILITY_REGISTRY) {
  if (!["cutover", "retired"].includes(capability.migrationStatus)) {
    findings.push(`ORGANIZER_CUTOVER_UNRESOLVED ${capability.legacyId}:${capability.migrationStatus}`);
  }
  for (const alias of capability.legacyRoutes) {
    if (!alias.startsWith("/")) findings.push(`ORGANIZER_LEGACY_ALIAS_ORPHAN ${capability.legacyId}:${alias}`);
  }
  if (!capability.targetRoute.startsWith("/")) {
    findings.push(`ORGANIZER_TARGET_ROUTE_ORPHAN ${capability.legacyId}:${capability.targetRoute}`);
  }
}

const runtimeRoutes: string[] = [];
let publicRuntimeRoutes = 0;
let organizerRuntimeRoutes = 0;
let apiRuntimeRoutes = 0;
const routeFiles = filesUnder(resolve(process.cwd(), "src/routes")).filter((path) => /\.(?:ts|tsx)$/.test(path));
for (const file of routeFiles) {
  const source = readFileSync(file, "utf8");
  const rawRoute = routeIdFromSource(source);
  if (!rawRoute) continue;
  const route = publicPath(rawRoute);
  if (!route || route.startsWith("/dev/")) continue;
  runtimeRoutes.push(route);

  if (route.startsWith("/api/")) {
    apiRuntimeRoutes += 1;
    if (!V3_API_CAPABILITY_REGISTRY.some((item) => item.route === route)) {
      findings.push(`RUNTIME_API_ROUTE_ORPHAN ${route}`);
    }
    continue;
  }

  if (isOrganizerRoute(route)) {
    organizerRuntimeRoutes += 1;
    if (!organizerOwner(route)) findings.push(`ORGANIZER_CONTROL_ROUTE_ORPHAN ${route}`);
  } else {
    publicRuntimeRoutes += 1;
    if (!publicOwner(route)) findings.push(`PUBLIC_SURFACE_ROUTE_ORPHAN ${route}`);
  }
}

const discoveredV3Flags = SOLARIS_FEATURE_FLAGS.filter((flag) => flag.startsWith("solaris_app_v3"));
const mappedV3Flags = new Set([...V3_PUBLIC_FEATURE_FLAGS, ...V3_ORGANIZER_FEATURE_FLAGS]);
const featureFlagDiff = setDiff(discoveredV3Flags, mappedV3Flags);
for (const flag of featureFlagDiff.missing) findings.push(`FEATURE_FLAG_ORPHAN ${flag}`);
for (const flag of featureFlagDiff.extra) findings.push(`FEATURE_FLAG_REGISTRY_ORPHAN ${flag}`);

const organizerRegistryIds = new Set(V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => item.legacyId));
const organizerClassificationIds = new Set(Object.keys(V3_ORGANIZER_CLASSIFICATION_BY_ID));
for (const id of V3_ORGANIZER_DISCOVERED_IDS) {
  if (!organizerRegistryIds.has(id)) findings.push(`ORGANIZER_CONTROL_ORPHAN ${id}`);
  if (!organizerClassificationIds.has(id)) findings.push(`ORGANIZER_CONTROL_CLASSIFICATION_ORPHAN ${id}`);
}
for (const item of V3_ORGANIZER_ROUTE_OWNERSHIP) {
  if (!V3_ORGANIZER_DISCOVERED_IDS.has(item.ownerLegacyId)) {
    findings.push(`ORGANIZER_ROUTE_ALIAS_OWNER_ORPHAN ${item.routePattern} -> ${item.ownerLegacyId}`);
  }
}

const publicSurfaceDiff = setDiff(
  SOLARIS_V6_FEATURE_SURFACES.map((item) => item.featureId),
  V3_PUBLIC_SOURCE_SURFACE_IDS,
);
for (const id of publicSurfaceDiff.missing) findings.push(`PUBLIC_SOURCE_SURFACE_ORPHAN ${id}`);
for (const id of publicSurfaceDiff.extra) findings.push(`PUBLIC_SOURCE_SURFACE_REGISTRY_ORPHAN ${id}`);

const knownDynamicNotificationRoutes = new Set([
  "dynamic:content_events.route",
  "dynamic:studio2_organizer_tasks.href",
]);
let notificationDeepLinks = 0;
let dynamicNotificationDeepLinks = 0;
for (const category of V3_NOTIFICATION_CATEGORY_REGISTRY) {
  notificationDeepLinks += 1;
  if (!canonicalRouteOwner(category.defaultRoute)) {
    findings.push(`NOTIFICATION_DEEP_LINK_ORPHAN category:${category.category} -> ${category.defaultRoute}`);
  }
}
for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
  for (const route of provider.routes) {
    notificationDeepLinks += 1;
    if (route.startsWith("dynamic:")) {
      dynamicNotificationDeepLinks += 1;
      if (!knownDynamicNotificationRoutes.has(route)) {
        findings.push(`NOTIFICATION_DYNAMIC_DEEP_LINK_ORPHAN ${provider.id} -> ${route}`);
      }
      continue;
    }
    if (!canonicalRouteOwner(route)) {
      findings.push(`NOTIFICATION_DEEP_LINK_ORPHAN provider:${provider.id} -> ${route}`);
    }
  }
}

const report = {
  schemaVersion: 2,
  zeroOrphans: findings.length === 0,
  inventory: {
    systemDomains: V3_SYSTEM_DOMAIN_REGISTRY.length,
    systemConcepts: V3_REQUIRED_SYSTEM_CONCEPTS.length,
    systemCommands: [...commandOwners.keys()].length,
    systemEvents: [...eventOwners.keys()].length,
    systemProjections: V3_SYSTEM_DOMAIN_REGISTRY.reduce((sum, item) => sum + item.projections.length, 0),
    systemBackgroundConsumers: V3_SYSTEM_DOMAIN_REGISTRY.reduce(
      (sum, item) => sum + item.backgroundConsumers.length,
      0,
    ),
    domainConsequences: V3_DOMAIN_CONSEQUENCE_REGISTRY.length,
    apiCapabilities: V3_API_CAPABILITY_REGISTRY.length,
    searchProviders: V3_SEARCH_PROVIDER_REGISTRY.length,
    notificationCategories: V3_NOTIFICATION_CATEGORY_REGISTRY.length,
    notificationProviders: V3_NOTIFICATION_PROVIDER_REGISTRY.length,
    notificationDeepLinks,
    dynamicNotificationDeepLinks,
    publicCapabilities: V3_PUBLIC_CAPABILITIES.length,
    organizerCapabilities: V3_ORGANIZER_CAPABILITY_REGISTRY.length,
    runtimeRoutes: runtimeRoutes.length,
    publicRuntimeRoutes,
    organizerRuntimeRoutes,
    apiRuntimeRoutes,
    legacyAliases:
      V3_PUBLIC_CAPABILITIES.reduce((sum, item) => sum + item.legacyRoutes.length, 0) +
      V3_ORGANIZER_CAPABILITY_REGISTRY.reduce((sum, item) => sum + item.legacyRoutes.length, 0),
    v3FeatureFlags: discoveredV3Flags.length,
    organizerControls: V3_ORGANIZER_DISCOVERED_IDS.size,
    publicSourceSurfaces: SOLARIS_V6_FEATURE_SURFACES.length,
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
