import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ORGANIZER_V3_CAPABILITIES } from "../docs/v3/organizer-capability-registry";
import { PUBLIC_V3_CAPABILITIES } from "../docs/v3/public-capability-registry";
import { PUBLIC_V3_NOTIFICATION_SIGNALS } from "../docs/v3/public-notification-registry";
import { SYSTEM_V3_DOMAINS } from "../docs/v3/system-domain-registry";
import { SYSTEM_V3_FEATURE_SIGNALS } from "../docs/v3/system-feature-registry";
import {
  SOLARIS_NOTIFICATION_CATEGORIES,
  SCHEDULED_TASK_NOTIFICATION_KINDS,
} from "../src/lib/notification-engine";
import { SOLARIS_CAPABILITIES } from "../src/lib/permissions-v2";
import { PUBLIC_DESTINATIONS, PUBLIC_GLOBAL_AREAS } from "../src/lib/public-navigation";
import { STUDIO2_PRODUCT_SURFACE_LIST } from "../src/lib/studio2-product-surfaces";
import { SOLARIS_FEATURE_FLAGS } from "../src/lib/feature-flags";

const ROOT = process.cwd();
const problems: string[] = [];

function fail(group: string, detail: string) {
  problems.push(`[${group}] ${detail}`);
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function duplicated(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function normalizeRoute(route: string) {
  let normalized = route.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  normalized = normalized.replace(/\$\{[^}]+\}/g, ":dynamic");

  const segments = normalized
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("_"))
    .map((segment) => {
      if (segment === "$" || segment === "$") return "*";
      if (segment.startsWith("$")) return `:${segment.slice(1)}`;
      return segment;
    });

  const result = `/${segments.join("/")}`;
  return result !== "/" ? result.replace(/\/+$/, "") : result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function registryPatternRegex(pattern: string, sourceRoute: boolean) {
  const normalized = normalizeRoute(pattern);
  const trailingSlashWildcard = normalized.endsWith("/*");
  const trailingWildcard = !trailingSlashWildcard && normalized.endsWith("*");
  const base = trailingSlashWildcard
    ? normalized.slice(0, -2)
    : trailingWildcard
      ? normalized.slice(0, -1)
      : normalized;

  let expression = escapeRegex(base);
  expression = expression.replace(/:[A-Za-z0-9_-]+/g, sourceRoute ? ":[A-Za-z0-9_-]+" : "[^/]+");

  if (trailingSlashWildcard) return new RegExp(`^${expression}(?:/.*)?$`);
  if (trailingWildcard) return new RegExp(`^${expression}.*$`);
  return new RegExp(`^${expression}$`);
}

function matchesAnyPattern(route: string, patterns: readonly string[], sourceRoute = false) {
  const normalized = normalizeRoute(route);
  return patterns.some((pattern) => registryPatternRegex(pattern, sourceRoute).test(normalized));
}

function allFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const absolute = join(path, name);
    const metadata = statSync(absolute);
    return metadata.isDirectory() ? allFiles(absolute) : [absolute];
  });
}

function routeIdsFromSource() {
  const routeRoot = join(ROOT, "src/routes");
  const routeFiles = allFiles(routeRoot).filter((path) => /\.(?:ts|tsx)$/.test(path));
  const routes: Array<{ route: string; file: string }> = [];
  const routeExpression = /createFileRoute\(\s*(["'`])([^"'`]+)\1\s*\)/g;

  for (const file of routeFiles) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(routeExpression)) {
      routes.push({ route: normalizeRoute(match[2]), file: relative(ROOT, file) });
    }
  }
  return routes;
}

const INFRASTRUCTURE_ROUTE_PATTERNS = [
  "/api/*",
  "/sitemap.xml",
  "/robots.txt",
] as const;

function isInfrastructureRoute(route: string) {
  return matchesAnyPattern(route, INFRASTRUCTURE_ROUTE_PATTERNS, true);
}

function isOrganizerRoute(route: string) {
  return (
    route === "/admin" ||
    route.startsWith("/admin/") ||
    route === "/confirmations/admin" ||
    route.startsWith("/confirmations/admin/") ||
    route === "/televoting/admin" ||
    route.startsWith("/televoting/admin/")
  );
}

function publicRouteCovered(route: string, sourceRoute = false) {
  return PUBLIC_V3_CAPABILITIES.some((capability) =>
    matchesAnyPattern(route, capability.legacyRoutes, sourceRoute),
  );
}

function organizerRouteCovered(route: string, sourceRoute = false) {
  return ORGANIZER_V3_CAPABILITIES.some((capability) =>
    matchesAnyPattern(route, capability.legacyRoutes, sourceRoute),
  );
}

function validateRegistryShape() {
  for (const id of duplicated(PUBLIC_V3_CAPABILITIES.map((capability) => capability.id))) {
    fail("public-registry", `Duplicate capability id: ${id}`);
  }
  for (const id of duplicated(ORGANIZER_V3_CAPABILITIES.map((capability) => capability.legacyId))) {
    fail("organizer-registry", `Duplicate capability id: ${id}`);
  }
  for (const id of duplicated(SYSTEM_V3_DOMAINS.map((domain) => domain.domain))) {
    fail("system-registry", `Duplicate domain owner: ${id}`);
  }

  for (const capability of PUBLIC_V3_CAPABILITIES) {
    if (!capability.legacyRoutes.length) fail("public-registry", `${capability.id} has no legacy route/surface mapping`);
    if (!capability.backendOwners.length) fail("public-registry", `${capability.id} has no backend owner`);
    if (!capability.personas.length) fail("public-registry", `${capability.id} has no personas`);
    if (!capability.acceptanceScenarioId.trim()) fail("public-registry", `${capability.id} has no acceptance scenario`);
  }

  const capabilityCatalog = new Set<string>(SOLARIS_CAPABILITIES);
  for (const capability of ORGANIZER_V3_CAPABILITIES) {
    if (!capability.legacyRoutes.length) fail("organizer-registry", `${capability.legacyId} has no legacy routes`);
    if (!capabilityCatalog.has(capability.ownerCapability)) {
      fail("organizer-registry", `${capability.legacyId} references unknown owner capability ${capability.ownerCapability}`);
    }
  }

  for (const domain of SYSTEM_V3_DOMAINS) {
    if (!domain.canonicalStore.trim()) fail("system-registry", `${domain.domain} has no canonical store`);
    if (!domain.authoritativeService.trim()) fail("system-registry", `${domain.domain} has no authoritative service`);
    if (!domain.retentionClass.trim()) fail("system-registry", `${domain.domain} has no retention class`);
    if (!domain.sensitivityClass.trim()) fail("system-registry", `${domain.domain} has no sensitivity class`);
  }
}

function validateRouteInventory() {
  const discovered = routeIdsFromSource();
  for (const { route, file } of discovered) {
    if (isInfrastructureRoute(route)) continue;
    if (isOrganizerRoute(route)) {
      if (!organizerRouteCovered(route, true)) {
        fail("organizer-route", `${route} (${file}) has no Organizer V3 capability classification`);
      }
      continue;
    }
    if (!publicRouteCovered(route, true)) {
      fail("public-route", `${route} (${file}) has no Public V3 capability classification`);
    }
  }
}

function validateNavigationInventory() {
  const destinations = [
    ...PUBLIC_GLOBAL_AREAS.map((area) => ({ id: `global:${area.id}`, to: area.to })),
    ...PUBLIC_DESTINATIONS.map((destination) => ({ id: destination.id, to: destination.to })),
  ];
  for (const destination of destinations) {
    if (!publicRouteCovered(destination.to)) {
      fail("public-navigation", `${destination.id} -> ${destination.to} has no Public V3 capability classification`);
    }
  }
}

function validateFeatureSurfaces() {
  const productKeys = STUDIO2_PRODUCT_SURFACE_LIST.map((surface) => surface.key).sort();
  const flagKeys = [...SOLARIS_FEATURE_FLAGS].sort();
  for (const feature of flagKeys.filter((feature) => !productKeys.includes(feature))) {
    fail("feature-surface", `${feature} exists in SOLARIS_FEATURE_FLAGS but has no product-surface definition`);
  }
  for (const feature of productKeys.filter((feature) => !flagKeys.includes(feature))) {
    fail("feature-surface", `${feature} exists as a product surface but not in SOLARIS_FEATURE_FLAGS`);
  }

  const publicSignals = new Set(PUBLIC_V3_CAPABILITIES.flatMap((capability) => capability.sourceSignals ?? []));
  const organizerSignals = new Set(ORGANIZER_V3_CAPABILITIES.flatMap((capability) => capability.sourceSignals ?? []));
  const systemSignals = new Map(SYSTEM_V3_FEATURE_SIGNALS.map((signal) => [signal.feature, signal.domain] as const));
  const systemDomains = new Set(SYSTEM_V3_DOMAINS.map((domain) => domain.domain));

  for (const surface of STUDIO2_PRODUCT_SURFACE_LIST) {
    if (surface.audience === "public" || surface.audience === "delegation") {
      if (!publicSignals.has(surface.key)) {
        fail("public-feature", `${surface.key} (${surface.audience}) has no Public V3 sourceSignals mapping`);
      }
      if (surface.route && !publicRouteCovered(surface.route)) {
        fail("public-feature", `${surface.key} route ${surface.route} has no Public V3 capability classification`);
      }
    } else if (surface.audience === "organizer") {
      if (!organizerSignals.has(surface.key)) {
        fail("organizer-feature", `${surface.key} has no Organizer V3 sourceSignals mapping`);
      }
      if (surface.route && !organizerRouteCovered(surface.route)) {
        fail("organizer-feature", `${surface.key} route ${surface.route} has no Organizer V3 capability classification`);
      }
    } else {
      const domain = systemSignals.get(surface.key);
      if (!domain) {
        fail("system-feature", `${surface.key} has no System V3 feature-to-domain mapping`);
      } else if (!systemDomains.has(domain)) {
        fail("system-feature", `${surface.key} maps to unknown System V3 domain ${domain}`);
      }
    }
  }
}

function validateNotificationInventory() {
  const canonicalSignals = [
    ...SOLARIS_NOTIFICATION_CATEGORIES.map((category) => `category:${category}`),
    ...SCHEDULED_TASK_NOTIFICATION_KINDS.map((kind) => `kind:${kind}`),
  ].sort();
  const registeredSignals = PUBLIC_V3_NOTIFICATION_SIGNALS.map((signal) => signal.signal).sort();
  const publicIds = new Set(PUBLIC_V3_CAPABILITIES.map((capability) => capability.id));

  for (const signal of canonicalSignals.filter((signal) => !registeredSignals.includes(signal))) {
    fail("notification", `${signal} is canonical but is missing from the Public V3 notification registry`);
  }
  for (const signal of registeredSignals.filter((signal) => !canonicalSignals.includes(signal))) {
    fail("notification", `${signal} is registered but no longer exists in the canonical notification vocabulary`);
  }
  for (const signal of PUBLIC_V3_NOTIFICATION_SIGNALS) {
    if (!publicIds.has(signal.capabilityId)) {
      fail("notification", `${signal.signal} maps to unknown Public V3 capability ${signal.capabilityId}`);
    }
  }
}

function validatePwaInventory() {
  const manifestPath = join(ROOT, "public/site.webmanifest");
  if (!existsSync(manifestPath)) {
    fail("pwa", "public/site.webmanifest is missing");
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    start_url?: string;
    shortcuts?: Array<{ name?: string; url?: string }>;
  };
  const destinations = [
    { label: "start_url", route: manifest.start_url },
    ...(manifest.shortcuts ?? []).map((shortcut) => ({
      label: `shortcut:${shortcut.name ?? "unnamed"}`,
      route: shortcut.url,
    })),
  ];

  for (const destination of destinations) {
    if (!destination.route) {
      fail("pwa", `${destination.label} has no route`);
    } else if (!publicRouteCovered(destination.route)) {
      fail("pwa", `${destination.label} -> ${destination.route} has no Public V3 capability classification`);
    }
  }
}

function validateSitemapInventory() {
  const path = join(ROOT, "src/routes/sitemap[.]xml.ts");
  if (!existsSync(path)) {
    fail("sitemap", "src/routes/sitemap[.]xml.ts is missing");
    return;
  }
  const source = readFileSync(path, "utf8");
  const sitemapPaths = unique(
    [...source.matchAll(/path:\s*(["'`])([^"'`]+)\1/g)].map((match) => normalizeRoute(match[2])),
  );
  for (const route of sitemapPaths) {
    if (!publicRouteCovered(route)) {
      fail("sitemap", `${route} has no Public V3 capability classification`);
    }
  }
}

validateRegistryShape();
validateRouteInventory();
validateNavigationInventory();
validateFeatureSurfaces();
validateNotificationInventory();
validatePwaInventory();
validateSitemapInventory();

if (problems.length) {
  const ordered = problems.sort();
  console.error(`V3 capability/domain registry guard found ${ordered.length} problem${ordered.length === 1 ? "" : "s"}:`);
  for (const problem of ordered) console.error(` - ${problem}`);
  console.error("\nClassify the capability/domain in docs/v3. Do not silence the scanner with a generic catch-all.");
  process.exit(1);
}

console.log(
  `V3 registry guard passed: ${PUBLIC_V3_CAPABILITIES.length} Public capabilities, ` +
    `${ORGANIZER_V3_CAPABILITIES.length} Organizer migrations, ${SYSTEM_V3_DOMAINS.length} System domains, ` +
    `${routeIdsFromSource().length} routed source surfaces checked.`,
);
