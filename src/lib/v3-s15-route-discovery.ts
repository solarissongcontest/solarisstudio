/**
 * S15 must not silently ignore route declarations that the static route
 * inventory cannot parse. Route IDs feed the capability/ownership check,
 * so a missing or duplicate ID can hide an orphan.
 *
 * Static and network-free. Unsupported dynamic factories fail closed.
 */
export type V3RuntimeRouteSource = {
  path: string;
  source: string;
};

const routeCall = /\bcreate(?:Lazy)?FileRoute\s*\(/g;
const literalRoute = /\bcreate(?:Lazy)?FileRoute\s*\(\s*(["'\x60])([^"'\x60]+)\1\s*,?\s*\)/g;

export function parseV3RuntimeRouteId(source: string): string | null {
  return [...source.matchAll(literalRoute)][0]?.[2] ?? null;
}

export function auditV3RuntimeRouteDeclarations(files: readonly V3RuntimeRouteSource[]): string[] {
  const findings: string[] = [];
  const owners = new Map<string, string>();

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const calls = [...file.source.matchAll(routeCall)];
    if (calls.length === 0) continue;

    const declarations = [...file.source.matchAll(literalRoute)];
    if (calls.length !== declarations.length) {
      findings.push(
        "RUNTIME_ROUTE_UNPARSEABLE " + file.path + ": " + calls.length +
          " factories, " + declarations.length + " literal IDs",
      );
    }
    if (declarations.length !== 1) {
      findings.push(
        "RUNTIME_ROUTE_DECLARATION_COUNT " + file.path +
          ": expected 1 literal route ID, found " + declarations.length,
      );
    }

    for (const declaration of declarations) {
      const routeId = declaration[2];
      const previous = owners.get(routeId);
      if (previous) {
        findings.push("RUNTIME_ROUTE_DUPLICATE " + routeId + ": " + previous + " and " + file.path);
      } else {
        owners.set(routeId, file.path);
      }
    }
  }

  return findings;
}
