/**
 * TG19 offline budget preflight for the merged TG3 public World query adapters.
 * It inspects source and NEVER imports an application Supabase client or makes I/O
 * to a database. Scope intentionally excludes live sessions, voting and chat.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORLD_PUBLIC_QUERY_SOURCES = [
  "src/lib/terra-world-public.ts",
  "src/lib/world-country-international-queries.ts",
  "src/lib/world-country-international.ts",
] as const;

export type WorldQueryBudgetFinding = {
  path: string;
  rule: string;
  detail: string;
};

const PUBLIC = WORLD_PUBLIC_QUERY_SOURCES[0];
const COUNTRY = WORLD_PUBLIC_QUERY_SOURCES[1];
const MODEL = WORLD_PUBLIC_QUERY_SOURCES[2];

function functionSource(source: string, name: string): string {
  const signature = `export async function ${name}(`;
  const start = source.indexOf(signature);
  if (start < 0) return "";
  const next = source.indexOf("\nexport ", start + signature.length);
  return source.slice(start, next < 0 ? undefined : next);
}

/** Fail-closed checks of selected, stable public data-boundary contracts. */
export function auditWorldPublicQueryBudget(
  files: Readonly<Record<string, string>>,
): WorldQueryBudgetFinding[] {
  const findings: WorldQueryBudgetFinding[] = [];
  const fail = (path: string, rule: string, detail: string) => findings.push({ path, rule, detail });
  const requirePattern = (path: string, section: string, pattern: RegExp, rule: string, detail: string) => {
    if (!pattern.test(section)) fail(path, rule, detail);
  };
  const fn = (path: string, name: string) => {
    const body = functionSource(files[path] ?? "", name);
    if (!body) fail(path, "missing-reader", `Missing ${name} public read contract`);
    return body;
  };
  const cap = (path: string, source: string, name: string, max: number) => {
    const match = new RegExp(`(?:export\s+)?const\s+${name}\s*=\s*(\d+)\s*;`).exec(source);
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      fail(path, "page-cap", `${name} must remain an explicit integer between 1 and ${max}`);
    }
  };

  for (const path of WORLD_PUBLIC_QUERY_SOURCES) {
    const source = files[path];
    if (typeof source !== "string" || source.length === 0) {
      fail(path, "missing-source", "Missing World public query source");
      continue;
    }
    // Static directories should never become long-lived realtime/polling loops.
    if (/\b(?:refetchInterval|setInterval|setTimeout)\s*(?:=|:|\()|\.channel\s*\(|\.subscribe\s*\(/.test(source)) {
      fail(path, "no-polling", "Static World public reads must not poll or subscribe");
    }
    // PostgREST '*' also downloads fields that can become sensitive later.
    if (/\.select\s*\(\s*(['"`])\s*\*\s*\1/.test(source)) {
      fail(path, "narrow-projection", "Wildcard columns are not permitted for World public reads");
    }
  }

  const publicSource = files[PUBLIC] ?? "";
  cap(PUBLIC, publicSource, "WORLD_DIRECTORY_PAGE_SIZE", 24);
  requirePattern(PUBLIC, publicSource,
    /\.select\s*\(\s*["']id,slug,official_name,short_name,type,description,status,public_visibility["']\s*,?/,
    "public-columns", "World directory must keep its explicitly reviewed publication-safe column list");
  const directory = fn(PUBLIC, "fetchWorldDirectory");
  requirePattern(PUBLIC, directory, /\.range\s*\(\s*page\s*\*\s*WORLD_DIRECTORY_PAGE_SIZE\s*,/, "directory-range", "World organizations must use a bounded page query");
  requirePattern(PUBLIC, directory, /\.eq\s*\(\s*["']public_visibility["']\s*,\s*["']public["']\s*\)/, "directory-public-only", "World organization lists must filter public visibility at the server");
  requirePattern(PUBLIC, directory, /count\s*:\s*["']exact["']/, "directory-count", "World organization pages must have a verified exact count");
  requirePattern(PUBLIC, directory, /Number\.isSafeInteger\(count\)/, "directory-count", "World organization count must be validated rather than inferred");
  requirePattern(PUBLIC, directory, /Math\.min\(1000\s*,\s*Math\.trunc\(input\.page\)/, "directory-page-bound", "World organization page input must be finite/bounded");

  const featured = fn(PUBLIC, "fetchFeaturedWorldOrganizations");
  requirePattern(PUBLIC, featured, /\.in\s*\(\s*["']slug["']\s*,\s*\[\s*["']guard["']\s*,\s*["']unity["']\s*\]\s*\)/, "featured-scope", "Featured World must fetch only GUARD and UNITY");
  requirePattern(PUBLIC, featured, /\.eq\s*\(\s*["']public_visibility["']\s*,\s*["']public["']\s*\)/, "featured-public-only", "Featured World must filter public organizations");

  const projection = fn(PUBLIC, "fetchWorldProjection");
  requirePattern(PUBLIC, projection, /\.rpc\s*\(\s*["']world_organization_projection_v1["']/, "projection-rpc", "World organization details must use the canonical bounded projection RPC");
  requirePattern(PUBLIC, projection, /\^\[a-z0-9\]/, "projection-slug", "World projection slug must be validated before RPC");
  if (/\.from\s*\(/.test(projection)) fail(PUBLIC, "projection-fanout", "World organization detail must not fetch entities through separate table requests");

  const countrySource = files[COUNTRY] ?? "";
  const modelSource = files[MODEL] ?? "";
  cap(COUNTRY, countrySource, "MAX_WORLD_PAGE", 1000);
  const approvedColumns = {
    COUNTRY_COLUMNS: "id,name,short_code,region,flag_image,accent_color",
    MEMBERSHIP_COLUMNS: "id,country_id,organization_id,membership_type,status,joined_at,ended_at",
    ORGANIZATION_COLUMNS: "id,slug,short_name,official_name,status,public_visibility",
  } as const;
  for (const [name, allowed] of Object.entries(approvedColumns)) {
    const match = new RegExp(`const\s+${name}\s*=\s*["']([^"']+)["']`).exec(countrySource);
    if (!match || match[1] !== allowed) {
      fail(COUNTRY, "approved-column-list", `${name} must retain the reviewed publication-safe field projection`);
    }
  }
  cap(MODEL, modelSource, "WORLD_COUNTRY_PAGE_SIZE", 24);
  cap(MODEL, modelSource, "WORLD_AFFILIATION_PAGE_SIZE", 24);
  requirePattern(COUNTRY, countrySource, /if\s*\(!Number\.isSafeInteger\(page\)\s*\|\|\s*page\s*<\s*0\s*\|\|\s*page\s*>\s*MAX_WORLD_PAGE\)/, "country-page-bound", "Country paging must reject invalid and oversized page values");

  const countries = fn(COUNTRY, "fetchWorldCountryDirectory");
  requirePattern(COUNTRY, countries, /checkedPage\(page\)\s*\*\s*WORLD_COUNTRY_PAGE_SIZE/, "country-page-bound", "Country directory must compute a bounded offset");
  requirePattern(COUNTRY, countries, /\.range\s*\(offset\s*,\s*offset\s*\+\s*WORLD_COUNTRY_PAGE_SIZE\s*-\s*1\)/, "country-range", "Country directory must limit every read to one page");
  requirePattern(COUNTRY, countries, /\.select\s*\(COUNTRY_COLUMNS\s*,\s*\{\s*count:\s*["']exact["']\s*\}\)/, "country-projection", "Country directory must select known columns and exact count");

  const memberships = fn(COUNTRY, "fetchWorldCountryMembershipPage");
  requirePattern(COUNTRY, memberships, /checkedPage\(page\)\s*\*\s*WORLD_AFFILIATION_PAGE_SIZE/, "affiliation-page-bound", "Country affiliations need bounded pagination");
  requirePattern(COUNTRY, memberships, /\.eq\s*\(\s*["']country_id["']\s*,\s*countryId\s*\)/, "affiliation-country-scope", "Country affiliations must filter by canonical country ID");
  requirePattern(COUNTRY, memberships, /\.range\s*\(offset\s*,\s*offset\s*\+\s*WORLD_AFFILIATION_PAGE_SIZE\s*-\s*1\)/, "affiliation-range", "Country affiliations must limit each response to one page");
  requirePattern(COUNTRY, memberships, /\.select\s*\(MEMBERSHIP_COLUMNS\s*,\s*\{\s*count:\s*["']exact["']\s*\}\)/, "affiliation-projection", "Affiliations must select known columns and exact count");

  const institutions = fn(COUNTRY, "fetchWorldPublicCountryInstitutions");
  requirePattern(COUNTRY, institutions, /organizationIds\.length\s*>\s*MAX_VISIBLE_ORGANIZATION_IDS/, "institution-id-cap", "Country institution lookup must cap its ID batch");
  requirePattern(COUNTRY, institutions, /\.in\s*\(\s*["']id["']\s*,\s*organizationIds\s*\)/, "institution-id-scope", "Country institution lookup must query only requested organization IDs");
  requirePattern(COUNTRY, institutions, /\.eq\s*\(\s*["']public_visibility["']\s*,\s*["']public["']\s*\)/, "institution-public-only", "Institution lookup must filter publication state");
  requirePattern(COUNTRY, institutions, /\.in\s*\(\s*["']status["']\s*,\s*\[\.\.\.WORLD_RECOGNIZED_INSTITUTION_STATUSES\]\s*\)/, "institution-recognition", "Institution lookup must filter recognized statuses");
  return findings;
}

export function inspectWorldPublicQuerySources(root = process.cwd()): WorldQueryBudgetFinding[] {
  const files: Record<string, string> = {};
  for (const path of WORLD_PUBLIC_QUERY_SOURCES) {
    try {
      files[path] = readFileSync(resolve(root, path), "utf8");
    } catch {
      files[path] = "";
    }
  }
  return auditWorldPublicQueryBudget(files);
}

// Explicit CLI entrypoint: no Supabase client, network transport, or production credentials.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = inspectWorldPublicQuerySources();
  console.log(JSON.stringify({ clean: findings.length === 0, inspected: WORLD_PUBLIC_QUERY_SOURCES, findings }, null, 2));
  if (findings.length > 0) process.exitCode = 1;
}
