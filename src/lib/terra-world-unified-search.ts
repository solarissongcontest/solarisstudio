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

function checkedCount(count: unknown, returned: number): number {
  if (typeof count !== "number" || !Number.isSafeInteger(count) ||
    count < 0 || count < returned || returned > WORLD_UNIFIED_SEARCH_LIMIT ||
    (count > 0 && returned === 0)) {
    throw new Error("World search count could not be verified.");
  }
  return count;
}

export function verifiedWorldSearchTerm(value: string): string {
  return cleanWorldSearch(value);
}

export async function fetchWorldUnifiedSearch(
  raw: string,
): Promise<WorldUnifiedSearchResult> {
  const term = verifiedWorldSearchTerm(raw);
  if (term.length < 2) {
    return { term, countries: [], organizations: [], countryTotal: 0, organizationTotal: 0 };
  }

  // Two small, parallel, RLS-authorized queries. No full-table downloads,
  // per-result hydration, private account data, or production-test fallback.
  const [countryResult, organizationResult] = await Promise.all([
    (supabase as any).from("countries")
      .select(COUNTRY_FIELDS, { count: "exact" })
      .or("name.ilike.%" + term + "%,short_code.ilike.%" + term + "%")
      .order("name", { ascending: true })
      .order("short_code", { ascending: true })
      .order("id", { ascending: true })
      .range(0, WORLD_UNIFIED_SEARCH_LIMIT - 1),
    (supabase as any).from("world_organizations")
      .select(ORGANIZATION_FIELDS, { count: "exact" })
      .eq("public_visibility", "public")
      .or("official_name.ilike.%" + term + "%,short_name.ilike.%" + term + "%")
      .order("official_name", { ascending: true })
      .order("slug", { ascending: true })
      .range(0, WORLD_UNIFIED_SEARCH_LIMIT - 1),
  ]);

  if (countryResult.error || organizationResult.error) {
    throw new Error("Public World search is temporarily unavailable.");
  }

  const countries = parseWorldSearchCountries(countryResult.data);
  if (!Array.isArray(organizationResult.data)) {
    throw new Error("Published organization results could not be verified.");
  }
  const organizations = parseWorldDirectoryRows(organizationResult.data);
  // A malformed/private row must never silently turn a misleading count into
  // a claim that a hidden institution exists.
  if (organizations.length !== organizationResult.data.length) {
    throw new Error("Published organization results could not be verified.");
  }

  return {
    term,
    countries,
    organizations,
    countryTotal: checkedCount(countryResult.count, countries.length),
    organizationTotal: checkedCount(organizationResult.count, organizations.length),
  };
}
