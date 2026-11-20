import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditWorldPublicQueryBudget, inspectWorldPublicQuerySources, WORLD_PUBLIC_QUERY_SOURCES } from "./terra-world-query-budget-audit";

const loadSources = () => Object.fromEntries(
  WORLD_PUBLIC_QUERY_SOURCES.map((path) => [path, readFileSync(resolve(process.cwd(), path), "utf8")]),
);
const publicPath = "src/lib/terra-world-public.ts";
const countryPath = "src/lib/world-country-international-queries.ts";
const mutate = (path: string, oldText: string, newText: string) => {
  const sources = loadSources();
  expect(sources[path]).toContain(oldText);
  sources[path] = sources[path].replace(oldText, newText);
  return auditWorldPublicQueryBudget(sources);
};

describe("TG19 offline public World query budget", () => {
  it("keeps every canonical TG3 public read bounded, scoped and non-polling", () => {
    expect(inspectWorldPublicQuerySources()).toEqual([]);
  });

  it("fails closed if any source is missing", () => {
    const sources = loadSources();
    delete sources[publicPath];
    expect(auditWorldPublicQueryBudget(sources).some((f) => f.rule === "missing-source")).toBe(true);
  });

  it("rejects unbounded institution directory requests", () => {
    const findings = mutate(publicPath, ".range(\n    page * WORLD_DIRECTORY_PAGE_SIZE,", ".range(\n    page,");
    expect(findings.some((f) => f.rule === "directory-range")).toBe(true);
  });

  it("rejects wildcard public projections and background polling", () => {
    const wildcard = mutate(publicPath, '.select("id,slug,official_name,short_name,type,description,status,public_visibility"', '.select("*"');
    expect(wildcard.some((f) => f.rule === "narrow-projection")).toBe(true);
    const polling = mutate(countryPath, 'const MAX_WORLD_PAGE = 1000;', 'const MAX_WORLD_PAGE = 1000;\nconst refetchInterval = 1000;');
    expect(polling.some((f) => f.rule === "no-polling")).toBe(true);
  });

  it("rejects organization-wide membership fan-out and unbounded relation lookup", () => {
    const scope = mutate(countryPath, '.eq("country_id", countryId)', '.eq("status", "member")');
    expect(scope.some((f) => f.rule === "affiliation-country-scope")).toBe(true);
    const ids = mutate(countryPath, 'organizationIds.length > MAX_VISIBLE_ORGANIZATION_IDS', 'organizationIds.length > 999999');
    expect(ids.some((f) => f.rule === "institution-id-cap")).toBe(true);
  });

  it("rejects unpublished or arbitrary organization fetches", () => {
    const visibility = mutate(countryPath, '.eq("public_visibility", "public")', '.eq("public_visibility", "private")');
    expect(visibility.some((f) => f.rule === "institution-public-only")).toBe(true);
    const featured = mutate(publicPath, '.in("slug", ["guard", "unity"])', '.order("slug")');
    expect(featured.some((f) => f.rule === "featured-scope")).toBe(true);
  });

  it("requires canonical single-RPC organization detail and explicit page caps", () => {
    const projection = mutate(publicPath, '.rpc("world_organization_projection_v1"', '.rpc("world_organization_projection_legacy"');
    expect(projection.some((f) => f.rule === "projection-rpc")).toBe(true);
    const cap = mutate(countryPath, 'const MAX_WORLD_PAGE = 1000;', 'const MAX_WORLD_PAGE = 999999;');
    expect(cap.some((f) => f.rule === "page-cap")).toBe(true);
  });
});
