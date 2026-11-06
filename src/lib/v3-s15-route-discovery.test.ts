import { describe, expect, it } from "vitest";

import { auditV3RuntimeRouteDeclarations } from "./v3-s15-route-discovery";

describe("S15 runtime route discovery", () => {
  it("accepts unique literal TanStack routes, including multiline and dynamic segments", () => {
    expect(
      auditV3RuntimeRouteDeclarations([
        {
          path: "src/routes/a.tsx",
          source: 'export const Route = createFileRoute("/_authenticated/countries/$countryId")({})',
        },
        {
          path: "src/routes/b.tsx",
          source: "export const Route = createFileRoute(\n  '/results'\n)({})",
        },
        { path: "src/routes/shared-helper.ts", source: "export const value = 1;" },
      ]),
    ).toEqual([]);
  });

  it("accepts trailing commas used by formatted TanStack route declarations", () => {
    expect(
      auditV3RuntimeRouteDeclarations([
        {
          path: "src/routes/broadcast.tsx",
          source: 'export const Route = createFileRoute(\n  "/broadcast/$showId",\n)({})',
        },
      ]),
    ).toEqual([]);
  });

  it("finds duplicate raw route IDs even when their source files differ", () => {
    expect(
      auditV3RuntimeRouteDeclarations([
        { path: "src/routes/z.tsx", source: 'createFileRoute("/countries")({})' },
        { path: "src/routes/a.tsx", source: "createFileRoute('/countries')({})" },
      ]),
    ).toContain("RUNTIME_ROUTE_DUPLICATE /countries: src/routes/a.tsx and src/routes/z.tsx");
  });

  it("fails closed for dynamic route factories instead of omitting the route", () => {
    expect(
      auditV3RuntimeRouteDeclarations([
        { path: "src/routes/mystery.tsx", source: "createFileRoute(routeName)({})" },
      ]),
    ).toEqual([
      "RUNTIME_ROUTE_UNPARSEABLE src/routes/mystery.tsx: 1 factories, 0 literal IDs",
      "RUNTIME_ROUTE_DECLARATION_COUNT src/routes/mystery.tsx: expected 1 literal route ID, found 0",
    ]);
  });

  it("detects multiple declarations in one route file", () => {
    const findings = auditV3RuntimeRouteDeclarations([
      {
        path: "src/routes/multiple.tsx",
        source: 'createFileRoute("/one")({}); createFileRoute("/two")({});',
      },
    ]);
    expect(findings).toContain(
      "RUNTIME_ROUTE_DECLARATION_COUNT src/routes/multiple.tsx: expected 1 literal route ID, found 2",
    );
  });

  it("recognizes literal lazy declarations instead of silently skipping them", () => {
    expect(
      auditV3RuntimeRouteDeclarations([
        { path: "src/routes/lazy.tsx", source: 'createLazyFileRoute("/lazy")({})' },
      ]),
    ).toEqual([]);
  });
});
