import { supabase } from "@/integrations/supabase/client";
import {
  cleanWorldSearch,
  parseWorldDirectoryRows,
  type WorldOrganization,
} from "./terra-world-public";

/**
 * Publication-safe, bounded World search. This is a reader of TG2's existing
 * country/organization authority, not another institutional search index.
 * The route must be mounted behind the canonical WorldPublicGate.
 */
export const WORLD_UNIFIED_SEARCH_LIMIT = 12;
export const WORLD_UNIFIED_SEARCH_MAX_PAGE = 1000;

/** Proposals are not yet official international organizations. */
export const WORLD_PUBLIC_SEARCH_STATUSES = [
  "recognized", "active", "suspended", "historical", "dissolved",
] as const;

export type WorldSearchCountry = {
  id: string;
  code: string;
  name: string;
  region: string;
  flagImage: string | null;
  accentColor: string;
};

export type WorldUnifiedSearchResult = {
  term: string;
  countries: WorldSearchCountry[];
  organizations: WorldOrganization[];
  countryTotal: number;
  organizationTotal: number;
};

const COUNTRY_FIELDS = "id,name,short_code,region,flag_image,accent_color";
const ORGANIZATION_FIELDS =
  "id,slug,official_name,short_name,type,description,status,public_visibility";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseWorldSearchCountries(raw: unknown): WorldSearchCountry[] {
  if (!Array.isArray(raw)) throw new Error("World country results could not be verified.");
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  return raw.map((value) => {
    const row = object(value);
    if (!row || !nonempty(row.id) || !nonempty(row.name) ||
      !nonempty(row.short_code) ||
      !/^[\p{L}\p{N}-]{2,20}$/u.test(row.short_code)) {
      throw new Error("World country identity could not be verified.");
    }
    const code = row.short_code;
    if (seenIds.has(row.id) || seenCodes.has(code.toUpperCase())) {
      throw new Error("Duplicate World country identity.");
    }
    seenIds.add(row.id);
    seenCodes.add(code.toUpperCase());
    return {
      id: row.id,
      code,
      name: row.name,
      region: typeof row.region === "string" ? row.region : "",
      flagImage: typeof row.flag_image === "string" ? row.flag_image : null,
      accentColor: typeof row.accent_color === "string" &&
        /^#[a-f\d]{6}$/i.test(row.accent_color) ? row.accent_color : "#40628a",
    };
  });
}

/**
 * Parse an untrusted URL page as a bounded page index. Bad bookmarks safely
 * start at the first page instead of triggering unbounded database offsets.
 */
export function parseWorldSearchPage(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  if (typeof value === "string" && !/^(0|[1-9][0-9]{0,3})$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 &&
    parsed <= WORLD_UNIFIED_SEARCH_MAX_PAGE ? parsed : 0;
}

function checkedPage(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > WORLD_UNIFIED_SEARCH_MAX_PAGE) {
    throw new Error("Invalid bounded World search page.");
  }
  return value;
}

/** Check an exact count against a bounded requested page without false zeros. */
function checkedCount(count: unknown, returned: number, page: number): number {
  if (typeof count !== "number" || !Number.isSafeInteger(count) ||
    count < 0 || returned > WORLD_UNIFIED_SEARCH_LIMIT ||
    (page === 0 && count > 0 && returned === 0) ||
    (returned > 0 && page * WORLD_UNIFIED_SEARCH_LIMIT + returned > count)) {
    throw new Error("World search count could not be verified.");
  }
  return count;
}

export function verifiedWorldSearchTerm(value: string): string {
  return cleanWorldSearch(value);
}

export type WorldCountrySearchPage = {
  countries: WorldSearchCountry[];
  countryTotal: number;
};

export type WorldOrganizationSearchPage = {
  organizations: WorldOrganization[];
  organizationTotal: number;
};

/**
 * Country result pages have their own React Query identity. Changing the
 * organization page must not refetch unchanged countries or their exact count.
 */
export async function fetchWorldCountrySearchPage(
  raw: string,
  page = 0,
): Promise<WorldCountrySearchPage> {
  checkedPage(page);
  const term = verifiedWorldSearchTerm(raw);
  if (term.length < 2) return { countries: [], countryTotal: 0 };

  const { data, error, count } = await (supabase as any).from("countries")
    .select(COUNTRY_FIELDS, { count: "exact" })
    .or("name.ilike.%" + term + "%,short_code.ilike.%" + term + "%,region.ilike.%" + term + "%")
    .order("name", { ascending: true })
    .order("short_code", { ascending: true })
    .order("id", { ascending: true })
    .range(page * WORLD_UNIFIED_SEARCH_LIMIT,
      (page + 1) * WORLD_UNIFIED_SEARCH_LIMIT - 1);
  if (error) throw new Error("Public World country search is temporarily unavailable.");

  const countries = parseWorldSearchCountries(data);
  return { countries, countryTotal: checkedCount(count, countries.length, page) };
}

/**
 * Institution pages select only public, recognized/historical organizations.
 * No private organization/member access or unbounded N+1 requests.
 */
export async function fetchWorldOrganizationSearchPage(
  raw: string,
  page = 0,
): Promise<WorldOrganizationSearchPage> {
  checkedPage(page);
  const term = verifiedWorldSearchTerm(raw);
  if (term.length < 2) return { organizations: [], organizationTotal: 0 };

  const { data, error, count } = await (supabase as any).from("world_organizations")
    .select(ORGANIZATION_FIELDS, { count: "exact" })
    .eq("public_visibility", "public")
    .in("status", [...WORLD_PUBLIC_SEARCH_STATUSES])
    .or("official_name.ilike.%" + term + "%,short_name.ilike.%" + term + "%")
    .order("official_name", { ascending: true })
    .order("slug", { ascending: true })
    .range(page * WORLD_UNIFIED_SEARCH_LIMIT,
      (page + 1) * WORLD_UNIFIED_SEARCH_LIMIT - 1);
  if (error) throw new Error("Public World organization search is temporarily unavailable.");
  if (!Array.isArray(data)) {
    throw new Error("Published organization results could not be verified.");
  }
  const organizations = parseWorldDirectoryRows(data);
  if (organizations.length !== data.length ||
    organizations.some((item) =>
      !(WORLD_PUBLIC_SEARCH_STATUSES as readonly string[]).includes(item.status))) {
    throw new Error("Published organization results could not be verified.");
  }
  return { organizations, organizationTotal: checkedCount(count, organizations.length, page) };
}

/** Aggregate convenience reader, without creating a competing cache/authority. */
export async function fetchWorldUnifiedSearch(
  raw: string,
  countryPage = 0,
  organizationPage = 0,
): Promise<WorldUnifiedSearchResult> {
  // Validate both page arguments before starting either request.
  checkedPage(countryPage);
  checkedPage(organizationPage);
  const term = verifiedWorldSearchTerm(raw);
  const [countries, organizations] = await Promise.all([
    fetchWorldCountrySearchPage(term, countryPage),
    fetchWorldOrganizationSearchPage(term, organizationPage),
  ]);
  return { term, ...countries, ...organizations };
}
