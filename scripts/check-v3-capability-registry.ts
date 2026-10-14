import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { SOLARIS_FEATURE_FLAGS } from "../src/lib/feature-flags";
import { SOLARIS_V6_FEATURE_SURFACES } from "../src/lib/solaris-v6-surface-registry";
import {
  V3_API_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_ORGANIZER_CLASSIFICATION_BY_ID,
  V3_ORGANIZER_DISCOVERED_IDS,
  V3_ORGANIZER_FEATURE_FLAGS,
  V3_ORGANIZER_NON_CAPABILITY_ROUTES,
  V3_ORGANIZER_ROUTE_OWNERSHIP,
  V3_PUBLIC_CAPABILITIES,
  V3_PUBLIC_FEATURE_FLAGS,
  V3_PUBLIC_SOURCE_SURFACE_IDS,
} from "../src/lib/v3-capability-registry";
import {
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
  v3SystemDomain,
} from "../src/lib/v3-system-domain-registry";

type Failure = { area: string; message: string };
const failures: Failure[] = [];

function fail(area: string, message: string) {
  failures.push({ area, message });
}

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
  const match = source.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/);
  return match?.[1] ?? null;
}

function apiMethodsFromSource(source: string) {
  return [...source.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s*:/g)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();
}

function publicPath(routeId: string) {
  if (routeId === "/_authenticated") return null;
  return routeId.replace(/^\/_authenticated(?=\/|$)/, "") || "/";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeMatches(pattern: string, route: string) {
  if (pattern === route) return true;
  if (!pattern.includes("*") && !pattern.includes(":")) {
    return route.startsWith(`${pattern}/`);
  }

  let expression = escapeRegex(pattern);
  expression = expression.replace(/\\\*/g, ".*");
  expression = expression.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "[^/]+");
  return new RegExp(`^${expression}$`).test(route);
}

function normalizeDynamicSegments(route: string) {
  return route.replace(/\$[A-Za-z][A-Za-z0-9_]*/g, ":param");
}

function normalizedPattern(pattern: string) {
  return pattern.replace(/:[A-Za-z][A-Za-z0-9_]*/g, ":param");
}

function organizerOwned(route: string) {
  if (V3_ORGANIZER_NON_CAPABILITY_ROUTES.has(route)) return true;
  const normalized = normalizeDynamicSegments(route);
  if (
    V3_ORGANIZER_CAPABILITY_REGISTRY.some((item) =>
      item.legacyRoutes.some((pattern) => routeMatches(normalizedPattern(pattern), normalized)),
    )
  ) {
    return true;
  }
  return V3_ORGANIZER_ROUTE_OWNERSHIP.some((alias) =>
    routeMatches(normalizedPattern(alias.routePattern), normalized),
  );
}

function publicOwned(route: string) {
  const normalized = normalizeDynamicSegments(route);
  return V3_PUBLIC_CAPABILITIES.some((item) =>
    [...item.legacyRoutes, item.targetRoute].some((pattern) =>
      routeMatches(normalizedPattern(pattern), normalized),
    ),
  );
}

const v6SurfaceDiff = setDiff(
  SOLARIS_V6_FEATURE_SURFACES.map((item) => item.featureId),
  V3_PUBLIC_SOURCE_SURFACE_IDS,
);
if (v6SurfaceDiff.missing.length || v6SurfaceDiff.extra.length) {
  fail(
    "public-surfaces",
    `V6 surface mapping drift. missing=${v6SurfaceDiff.missing.join(",") || "none"} extra=${v6SurfaceDiff.extra.join(",") || "none"}`,
  );
}

const organizerClassificationDiff = setDiff(
  V3_ORGANIZER_DISCOVERED_IDS,
  Object.keys(V3_ORGANIZER_CLASSIFICATION_BY_ID),
);
if (organizerClassificationDiff.missing.length || organizerClassificationDiff.extra.length) {
  fail(
    "organizer-capabilities",
    `Organizer classification drift. missing=${organizerClassificationDiff.missing.join(",") || "none"} extra=${organizerClassificationDiff.extra.join(",") || "none"}`,
  );
}

const organizerRegistryDiff = setDiff(
  V3_ORGANIZER_DISCOVERED_IDS,
  V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => item.legacyId),
);
if (organizerRegistryDiff.missing.length || organizerRegistryDiff.extra.length) {
  fail(
    "organizer-registry",
    `Organizer registry drift. missing=${organizerRegistryDiff.missing.join(",") || "none"} extra=${organizerRegistryDiff.extra.join(",") || "none"}`,
  );
}

for (const alias of V3_ORGANIZER_ROUTE_OWNERSHIP) {
  if (!V3_ORGANIZER_DISCOVERED_IDS.has(alias.ownerLegacyId)) {
    fail(
      "organizer-route-ownership",
      `${alias.routePattern} points at unknown Organizer capability ${alias.ownerLegacyId}`,
    );
  }
}

const expectedV3Flags = SOLARIS_FEATURE_FLAGS.filter((flag) => flag.startsWith("solaris_app_v3"));
const mappedV3Flags = new Set([...V3_PUBLIC_FEATURE_FLAGS, ...V3_ORGANIZER_FEATURE_FLAGS]);
const flagDiff = setDiff(expectedV3Flags, mappedV3Flags);
if (flagDiff.missing.length || flagDiff.extra.length) {
  fail(
    "feature-flags",
    `V3 feature flag ownership drift. missing=${flagDiff.missing.join(",") || "none"} extra=${flagDiff.extra.join(",") || "none"}`,
  );
}

for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) {
  const owner = V3_SYSTEM_CONCEPT_OWNER[concept];
  if (!owner || !v3SystemDomain(owner)) fail("system-concepts", `${concept} has no registered canonical owner`);
}

const systemIds = V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain);
if (new Set(systemIds).size !== systemIds.length) fail("system-domains", "Duplicate System domain ID detected");
for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
  if (domain.physicalAuditStatus === "verified" && !domain.primaryTables.length) {
    fail("system-domains", `${domain.domain} is marked physically verified without a primary table`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/site.webmanifest"), "utf8")) as {
  shortcuts?: Array<{ url?: string }>;
};
for (const shortcut of manifest.shortcuts ?? []) {
  if (!shortcut.url || !publicOwned(shortcut.url)) {
    fail("pwa-shortcuts", `Unregistered PWA shortcut: ${shortcut.url ?? "<missing url>"}`);
  }
}

const apiRouteIds: string[] = [];
const routeFiles = filesUnder(resolve(process.cwd(), "src/routes")).filter((path) => /\.(?:ts|tsx)$/.test(path));
for (const file of routeFiles) {
  const source = readFileSync(file, "utf8");
  const rawRouteId = routeIdFromSource(source);
  if (!rawRouteId) continue;
  const route = publicPath(rawRouteId);
  if (!route) continue;

  // Development-only diagnostics are not production product capabilities.
  if (route.startsWith("/dev/")) continue;

  if (route.startsWith("/api/")) {
    apiRouteIds.push(route);
    const registered = V3_API_CAPABILITY_REGISTRY.find((item) => item.route === route);
    if (!registered) {
      fail("api-routes", `Unregistered API route: ${rawRouteId} (${file.replace(`${process.cwd()}/`, "")})`);
      continue;
    }

    const sourceMethods = apiMethodsFromSource(source);
    const registeredMethods = [...registered.methods].sort();
    const methodDiff = setDiff(sourceMethods, registeredMethods);
    if (methodDiff.missing.length || methodDiff.extra.length) {
      fail(
        "api-methods",
        `${route} method ownership drift. source=${sourceMethods.join(",") || "none"} registry=${registeredMethods.join(",") || "none"}`,
      );
    }
    const consequential = sourceMethods.some((method) => method !== "GET");
    if (consequential !== registered.mutation) {
      fail("api-mutation", `${route} mutation=${registered.mutation} does not match its HTTP methods`);
    }
    if (registered.mutation && registered.riskTier === 0) {
      fail("api-risk", `${route} is mutating but has Risk Tier 0`);
    }
    continue;
  }

  const isOrganizer =
    route.startsWith("/admin") ||
    route.startsWith("/confirmations/admin") ||
    route.startsWith("/televoting/admin");
  const owned = isOrganizer ? organizerOwned(route) : publicOwned(route);
  if (!owned) {
    fail(
      isOrganizer ? "organizer-routes" : "public-routes",
      `Unregistered Solaris capability route: ${rawRouteId} (${file.replace(`${process.cwd()}/`, "")})`,
    );
  }
}

const apiDiff = setDiff(apiRouteIds, V3_API_CAPABILITY_REGISTRY.map((item) => item.route));
if (apiDiff.missing.length || apiDiff.extra.length) {
  fail(
    "api-registry",
    `API route ownership drift. missing=${apiDiff.missing.join(",") || "none"} extra=${apiDiff.extra.join(",") || "none"}`,
  );
}

if (failures.length) {
  console.error("V3 capability registry guard failed.\n");
  for (const failure of failures) console.error(`[${failure.area}] ${failure.message}`);
  console.error("\nClassify the capability before merging. UNKNOWN is not a release state.");
  process.exit(1);
}

console.log(
  [
    "V3 capability registry guard passed",
    `public=${V3_PUBLIC_CAPABILITIES.length}`,
    `organizer=${V3_ORGANIZER_CAPABILITY_REGISTRY.length}`,
    `api=${V3_API_CAPABILITY_REGISTRY.length}`,
    `systemDomains=${V3_SYSTEM_DOMAIN_REGISTRY.length}`,
    `systemConcepts=${V3_REQUIRED_SYSTEM_CONCEPTS.length}`,
    `v3Flags=${mappedV3Flags.size}`,
  ].join(" · "),
);
