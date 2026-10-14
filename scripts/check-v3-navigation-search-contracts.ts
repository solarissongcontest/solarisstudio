import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ORGANIZER_V3_CAPABILITIES } from "../docs/v3/organizer-capability-registry";
import { PUBLIC_V3_CAPABILITIES } from "../docs/v3/public-capability-registry";
import { PUBLIC_V3_SEARCH_PROVIDERS } from "../docs/v3/public-search-provider-registry";
import { NAV_TARGETS } from "../src/lib/navigation-targets";

const ROOT = process.cwd();
const problems: string[] = [];

function fail(group: string, detail: string) {
  problems.push(`[${group}] ${detail}`);
}

function allFiles(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const absolute = join(path, name);
    const metadata = statSync(absolute);
    return metadata.isDirectory() ? allFiles(absolute) : [absolute];
  });
}

function routeOnly(value: string) {
  return value.split(/[?#]/, 1)[0] || "/";
}

function normalizeRoute(route: string) {
  let normalized = routeOnly(route.trim());
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
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

function patternRegex(pattern: string, sourceTemplate: boolean) {
  const normalized = normalizeRoute(pattern);
  const trailingSlashWildcard = normalized.endsWith("/*");
  const trailingWildcard = !trailingSlashWildcard && normalized.endsWith("*");
  const base = trailingSlashWildcard
    ? normalized.slice(0, -2)
    : trailingWildcard
      ? normalized.slice(0, -1)
      : normalized;
  let expression = escapeRegex(base);
  expression = expression.replace(
    /:[A-Za-z0-9_-]+/g,
    sourceTemplate ? ":[A-Za-z0-9_-]+" : "[^/]+",
  );
  if (trailingSlashWildcard) return new RegExp(`^${expression}(?:/.*)?$`);
  if (trailingWildcard) return new RegExp(`^${expression}.*$`);
  return new RegExp(`^${expression}$`);
}

function coveredBy(route: string, patterns: readonly string[], sourceTemplate = false) {
  const normalized = normalizeRoute(route);
  return patterns.some((pattern) => patternRegex(pattern, sourceTemplate).test(normalized));
}

function isOrganizerDestination(route: string) {
  const normalized = normalizeRoute(route);
  return (
    normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    normalized === "/confirmations/admin" ||
    normalized.startsWith("/confirmations/admin/") ||
    normalized === "/televoting/admin" ||
    normalized.startsWith("/televoting/admin/")
  );
}

function validateDestination(route: string, source: string, sourceTemplate = false) {
  const registry = isOrganizerDestination(route)
    ? ORGANIZER_V3_CAPABILITIES.map((item) => item.legacyRoutes)
    : PUBLIC_V3_CAPABILITIES.map((item) => item.legacyRoutes);
  if (!registry.some((patterns) => coveredBy(route, patterns, sourceTemplate))) {
    fail(
      isOrganizerDestination(route) ? "organizer-deep-link" : "public-deep-link",
      `${source} -> ${route} has no V3 capability classification`,
    );
  }
}

function validateCanonicalDeepLinks() {
  for (const [name, route] of Object.entries(NAV_TARGETS)) {
    validateDestination(route, `NAV_TARGETS.${name}`);
  }
}

function validateLiteralRedirects() {
  const routeRoot = join(ROOT, "src/routes");
  const files = allFiles(routeRoot).filter((path) => /\.(?:ts|tsx)$/.test(path));
  // Deliberately only static redirect destinations. Dynamic targets are owned by
  // their helper/registry and cannot be safely inferred from source text.
  const redirectLiteral = /redirect\s*\(\s*\{[\s\S]{0,800}?\bto:\s*(["'`])([^"'`$]+)\1/g;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(redirectLiteral)) {
      const destination = match[2];
      if (!destination.startsWith("/")) continue;
      validateDestination(destination, `redirect in ${relative(ROOT, file)}`, true);
    }
  }
}

function validateSearchProviders() {
  const publicCapabilityIds = new Set(PUBLIC_V3_CAPABILITIES.map((item) => item.id));
  const seen = new Set<string>();

  for (const provider of PUBLIC_V3_SEARCH_PROVIDERS) {
    if (seen.has(provider.id)) fail("search-provider", `duplicate provider id ${provider.id}`);
    seen.add(provider.id);

    if (!publicCapabilityIds.has(provider.entryCapabilityId)) {
      fail("search-provider", `${provider.id} maps to unknown entry capability ${provider.entryCapabilityId}`);
    }
    for (const capabilityId of provider.contentOwnerCapabilityIds) {
      if (!publicCapabilityIds.has(capabilityId)) {
        fail("search-provider", `${provider.id} maps to unknown content capability ${capabilityId}`);
      }
    }
    if (!provider.publicationBoundary.trim()) {
      fail("search-provider", `${provider.id} has no publication-boundary statement`);
    }

    const paths = [provider.sourcePath, ...provider.evidencePaths];
    const missingPaths = paths.filter((path) => !existsSync(join(ROOT, path)));
    for (const path of missingPaths) {
      fail("search-provider", `${provider.id} evidence path is missing: ${path}`);
    }
    const searchable = paths
      .filter((path) => existsSync(join(ROOT, path)))
      .map((path) => readFileSync(join(ROOT, path), "utf8"))
      .join("\n");
    for (const signal of provider.sourceSignals) {
      if (!searchable.includes(signal)) {
        fail("search-provider", `${provider.id} source signal disappeared: ${signal}`);
      }
    }
  }
}

validateCanonicalDeepLinks();
validateLiteralRedirects();
validateSearchProviders();

if (problems.length) {
  const ordered = problems.sort();
  console.error(
    `V3 navigation/search contract guard found ${ordered.length} problem${ordered.length === 1 ? "" : "s"}:`,
  );
  for (const problem of ordered) console.error(` - ${problem}`);
  console.error("\nClassify or repair the producer. Do not add a broad route exemption.");
  process.exit(1);
}

console.log(
  `V3 navigation/search contracts passed: ${Object.keys(NAV_TARGETS).length} canonical deep links, ` +
    `${PUBLIC_V3_SEARCH_PROVIDERS.length} search providers, and literal route redirects verified.`,
);
