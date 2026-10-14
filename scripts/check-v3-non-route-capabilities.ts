import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { V3_PUBLIC_CAPABILITIES } from "../src/lib/v3-capability-registry";
import {
  V3_NOTIFICATION_CATEGORY_REGISTRY,
  V3_NOTIFICATION_PROVIDER_REGISTRY,
} from "../src/lib/v3-notification-provider-registry";
import { V3_SEARCH_PROVIDER_REGISTRY } from "../src/lib/v3-search-provider-registry";
import { v3SystemDomain } from "../src/lib/v3-system-domain-registry";
import { V3_VERIFIED_DOMAIN_TABLES } from "../src/lib/v3-system-physical-audit";

type Failure = { area: string; message: string };
const failures: Failure[] = [];
const fail = (area: string, message: string) => failures.push({ area, message });

function setDiff(expected: Iterable<string>, actual: Iterable<string>) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: [...expectedSet].filter((item) => !actualSet.has(item)).sort(),
    extra: [...actualSet].filter((item) => !expectedSet.has(item)).sort(),
  };
}

function file(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const publicCapabilityIds = new Set(V3_PUBLIC_CAPABILITIES.map((item) => item.id));

// Search providers ---------------------------------------------------------
const palette = file("src/components/public/PublicCommandPalette.tsx");
const paletteRpcs = [...palette.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
const registeredSearchRpcEvidence = V3_SEARCH_PROVIDER_REGISTRY
  .filter((provider) => provider.mode === "remote-rpc")
  .flatMap((provider) => provider.evidence);

for (const rpc of paletteRpcs) {
  if (!registeredSearchRpcEvidence.some((evidence) => evidence.includes(rpc))) {
    fail("search-rpc", `Public Search uses unregistered RPC ${rpc}`);
  }
}

const literalGroups = new Set(
  [...palette.matchAll(/\bgroup:\s*["']([^"']+)["']/g)].map((match) => match[1]),
);
const registeredGroups = new Set(V3_SEARCH_PROVIDER_REGISTRY.flatMap((provider) => provider.resultGroups));
for (const group of literalGroups) {
  if (!registeredGroups.has(group)) fail("search-groups", `Unregistered Public Search result group ${group}`);
}

const providerIds = V3_SEARCH_PROVIDER_REGISTRY.map((provider) => provider.id);
if (new Set(providerIds).size !== providerIds.length) fail("search-providers", "Duplicate search provider ID");
for (const provider of V3_SEARCH_PROVIDER_REGISTRY) {
  if (!v3SystemDomain(provider.ownerDomain)) {
    fail("search-providers", `${provider.id} has unknown owner domain ${provider.ownerDomain}`);
  }
  if (!publicCapabilityIds.has(provider.capabilityId)) {
    fail("search-providers", `${provider.id} has unknown Public capability ${provider.capabilityId}`);
  }
  for (const evidence of provider.evidence) {
    const [path, token] = evidence.split("#", 2);
    if (!path.startsWith("src/") && !path.startsWith("supabase/") && !path.startsWith("public/")) continue;
    let source = "";
    try {
      source = file(path);
    } catch {
      fail("search-evidence", `${provider.id} references missing source ${path}`);
      continue;
    }
    if (token && !source.includes(token)) {
      fail("search-evidence", `${provider.id} source ${path} no longer contains ${token}`);
    }
  }
}

// Notification categories -------------------------------------------------
const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

let latestPreferenceConstraint: { path: string; categories: string[] } | null = null;
for (const name of migrationFiles) {
  const path = `supabase/migrations/${name}`;
  const source = file(path);
  if (!source.includes("notification_preferences_categories_check")) continue;
  const match = source.match(/categories\s*<@\s*array\[(.*?)\]::text\[\]/s);
  if (!match) continue;
  const categories = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
  latestPreferenceConstraint = { path, categories };
}

if (!latestPreferenceConstraint) {
  fail("notification-categories", "Could not find the canonical notification preference category constraint");
} else {
  const expected = V3_NOTIFICATION_CATEGORY_REGISTRY
    .filter((item) => item.preferenceControlled)
    .map((item) => item.category);
  const diff = setDiff(expected, latestPreferenceConstraint.categories);
  if (diff.missing.length || diff.extra.length) {
    fail(
      "notification-categories",
      `${latestPreferenceConstraint.path} category drift. missing=${diff.missing.join(",") || "none"} extra=${diff.extra.join(",") || "none"}`,
    );
  }
}

const notificationCategories = V3_NOTIFICATION_CATEGORY_REGISTRY.map((item) => item.category);
if (new Set(notificationCategories).size !== notificationCategories.length) {
  fail("notification-categories", "Duplicate notification category");
}
for (const category of V3_NOTIFICATION_CATEGORY_REGISTRY) {
  if (!v3SystemDomain(category.ownerDomain)) {
    fail("notification-categories", `${category.category} has unknown owner domain ${category.ownerDomain}`);
  }
}

const notificationProviderIds = V3_NOTIFICATION_PROVIDER_REGISTRY.map((provider) => provider.id);
if (new Set(notificationProviderIds).size !== notificationProviderIds.length) {
  fail("notification-providers", "Duplicate notification provider ID");
}
const knownCategories = new Set(notificationCategories);
const registeredConcreteEventTypes = new Set(
  V3_NOTIFICATION_PROVIDER_REGISTRY.flatMap((provider) =>
    provider.eventTypes.filter((eventType) => !eventType.endsWith(".*")),
  ),
);

for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
  if (!v3SystemDomain(provider.ownerDomain)) {
    fail("notification-providers", `${provider.id} has unknown owner domain ${provider.ownerDomain}`);
  }
  for (const category of provider.categories) {
    if (!knownCategories.has(category)) fail("notification-providers", `${provider.id} uses unknown category ${category}`);
  }
  for (const sourcePath of provider.sourceFiles) {
    let source = "";
    try {
      source = file(sourcePath);
    } catch {
      fail("notification-evidence", `${provider.id} references missing source ${sourcePath}`);
      continue;
    }
    for (const eventType of provider.eventTypes) {
      if (eventType.endsWith(".*")) continue;
      const foundSomewhere = provider.sourceFiles.some((candidate) => {
        try {
          return file(candidate).includes(eventType);
        } catch {
          return false;
        }
      });
      if (!foundSomewhere) {
        fail("notification-evidence", `${provider.id} event ${eventType} is not present in its source files`);
      }
    }
    void source;
  }
}

// Discover dot-qualified delivery events in every migration that touches the
// delivery table. This catches new explicit event types without attempting to
// parse arbitrary SQL expressions. Dynamic content_events passthrough is
// represented by the registered content_events.* provider.
const discoveredDeliveryEvents = new Set<string>();
for (const name of migrationFiles) {
  const source = file(`supabase/migrations/${name}`);
  if (!source.includes("notification_deliveries")) continue;
  for (const match of source.matchAll(/'([a-z][a-z0-9_]*\.[a-z0-9_.]+)'/g)) {
    const value = match[1];
    if (value.startsWith("public.") || value.startsWith("private.") || value.startsWith("auth.") || value.startsWith("televoting.")) continue;
    discoveredDeliveryEvents.add(value);
  }
}
for (const eventType of discoveredDeliveryEvents) {
  if (!registeredConcreteEventTypes.has(eventType)) {
    fail("notification-events", `Unregistered explicit notification event type ${eventType}`);
  }
}

// Physical ownership evidence --------------------------------------------
for (const [domain, tables] of Object.entries(V3_VERIFIED_DOMAIN_TABLES)) {
  if (!v3SystemDomain(domain)) fail("physical-audit", `${domain} physical inventory has no System domain owner`);
  if (!tables.length) fail("physical-audit", `${domain} has an empty verified table list`);
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(table)) {
      fail("physical-audit", `${domain} has non-schema-qualified table ${table}`);
    }
  }
}

if (failures.length) {
  console.error("V3 non-route capability guard failed.\n");
  for (const failure of failures) console.error(`[${failure.area}] ${failure.message}`);
  console.error("\nRegister the capability/provider before merging. UNKNOWN is not a release state.");
  process.exit(1);
}

console.log(
  [
    "V3 non-route capability guard passed",
    `searchProviders=${V3_SEARCH_PROVIDER_REGISTRY.length}`,
    `notificationCategories=${V3_NOTIFICATION_CATEGORY_REGISTRY.length}`,
    `notificationProviders=${V3_NOTIFICATION_PROVIDER_REGISTRY.length}`,
    `physicalDomains=${Object.keys(V3_VERIFIED_DOMAIN_TABLES).length}`,
  ].join(" · "),
);
