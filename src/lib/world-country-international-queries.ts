import { supabase } from "@/integrations/supabase/client";
import {
  WORLD_AFFILIATION_PAGE_SIZE,
  WORLD_COUNTRY_PAGE_SIZE,
  normalizeWorldCountrySearch,
  parseWorldCountryAffiliations,
  parseWorldCountryIdentity,
  parseWorldPublicCountries,
  parseWorldPublicInstitutions,
  WORLD_RECOGNIZED_INSTITUTION_STATUSES,
  parseWorldPublicRollout,
  validWorldCountryCode,
  verifiedWorldCount,
  worldCountrySearchFilter,
  type WorldCountryAffiliation,
  type WorldPublicCountry,
  type WorldPublicInstitution,
} from "./world-country-international";

/**
 * Public World country queries. Each reader has a bounded, exact scope and a
 * narrowly selected projection; authorization is always enforced by TG2 RLS.
 *
 * Keep the rollout cache identity aligned with #1934's WorldPublicGate.
 */
export const WORLD_PUBLIC_ROLLOUT_QUERY_KEY = ["world", "public", "rollout"] as const;

const COUNTRY_COLUMNS = "id,name,short_code,region,flag_image,accent_color";
const MEMBERSHIP_COLUMNS = "id,country_id,organization_id,membership_type,status,joined_at,ended_at";
const ORGANIZATION_COLUMNS = "id,slug,short_name,official_name,status,public_visibility";
const MAX_WORLD_PAGE = 1000;
const MAX_VISIBLE_ORGANIZATION_IDS = 2 * WORLD_AFFILIATION_PAGE_SIZE;
type Phase = "current" | "historical";

function checkedPage(page: number): number {
  if (!Number.isSafeInteger(page) || page < 0 || page > MAX_WORLD_PAGE) {
    throw new Error("Invalid bounded World page");
  }
  return page;
}

function checkedPageResult<T>(rows: T[], rawCount: unknown, page: number, pageSize: number) {
  const count = verifiedWorldCount(rawCount);
  if (rows.length > pageSize || (rows.length > 0 && page * pageSize + rows.length > count) ||
      (page === 0 && rows.length === 0 && count > 0)) {
    throw new Error("Inconsistent World page response");
  }
  return { rows, count };
}

export async function fetchWorldCountryRollout(): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("studio2_feature_enabled", {
    p_key: "terra_world_public",
    p_edition_id: null,
  });
  if (error) throw new Error("World publication state could not be verified");
  return parseWorldPublicRollout(data);
}

export async function fetchWorldCountryDirectory(
  search: string,
  page: number,
  signal?: AbortSignal,
): Promise<{ countries: WorldPublicCountry[]; count: number }> {
  const offset = checkedPage(page) * WORLD_COUNTRY_PAGE_SIZE;
  const safeSearch = normalizeWorldCountrySearch(search);
  if (signal?.aborted) throw new DOMException("World lookup cancelled.", "AbortError");
  let request = (supabase as any).from("countries").select(COUNTRY_COLUMNS, { count: "exact" });
  const filter = worldCountrySearchFilter(safeSearch);
  if (filter) request = request.or(filter);
  request = request
    .order("name", { ascending: true })
    .order("short_code", { ascending: true })
    .order("id", { ascending: true });
  if (signal) request = request.abortSignal(signal);
  const { data, count, error } = await request.range(offset, offset + WORLD_COUNTRY_PAGE_SIZE - 1);
  if (error) throw error;
  const pageResult = checkedPageResult(parseWorldPublicCountries(data), count, page, WORLD_COUNTRY_PAGE_SIZE);
  return { countries: pageResult.rows, count: pageResult.count };
}

export async function fetchWorldCountryIdentity(code: string, signal?: AbortSignal): Promise<WorldPublicCountry | null> {
  if (!validWorldCountryCode(code)) throw new Error("Invalid requested country code");
  if (signal?.aborted) throw new DOMException("World lookup cancelled.", "AbortError");
  let request = (supabase as any).from("countries")
    .select(COUNTRY_COLUMNS).ilike("short_code", code);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return parseWorldCountryIdentity(data, code);
}

export async function fetchWorldCountryMembershipPage(
  countryId: string,
  phase: Phase,
  page: number,
  signal?: AbortSignal,
): Promise<{ rows: WorldCountryAffiliation[]; count: number }> {
  const offset = checkedPage(page) * WORLD_AFFILIATION_PAGE_SIZE;
  if (typeof countryId !== "string" || countryId.trim().length === 0 || countryId.length > 80) {
    throw new Error("Missing country identity");
  }
  if (phase !== "current" && phase !== "historical") {
    throw new Error("Invalid World affiliation phase");
  }
  if (signal?.aborted) throw new DOMException("World lookup cancelled.", "AbortError");
  // No organization-wide or unscoped membership scan is allowed.
  let request = (supabase as any).from("world_organization_memberships")
    .select(MEMBERSHIP_COLUMNS, { count: "exact" }).eq("country_id", countryId);
  if (phase === "current") {
    request = request.is("ended_at", null).in("status", ["member", "observer", "associate", "suspended"]);
  } else {
    request = request.not("ended_at", "is", null).in("status", ["withdrawn", "expelled", "former"]);
  }
  request = request
    .order(phase === "current" ? "joined_at" : "ended_at", { ascending: false })
    .order("id", { ascending: true });
  if (signal) request = request.abortSignal(signal);
  const { data, count, error } = await request.range(offset, offset + WORLD_AFFILIATION_PAGE_SIZE - 1);
  if (error) throw error;
  return checkedPageResult(
    parseWorldCountryAffiliations(data, countryId, phase),
    count, page, WORLD_AFFILIATION_PAGE_SIZE,
  );
}

export async function fetchWorldPublicCountryInstitutions(
  organizationIds: readonly string[],
  signal?: AbortSignal,
): Promise<WorldPublicInstitution[]> {
  if (!Array.isArray(organizationIds) || organizationIds.length > MAX_VISIBLE_ORGANIZATION_IDS ||
      organizationIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 80) ||
      new Set(organizationIds).size !== organizationIds.length) {
    throw new Error("Invalid public World organization scope");
  }
  if (organizationIds.length === 0) return [];
  if (signal?.aborted) throw new DOMException("World lookup cancelled.", "AbortError");
  // A second live publication check guards against a visibility change
  // between the membership fetch and this institution-name lookup.
  let request = (supabase as any).from("world_organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq("public_visibility", "public")
    .in("status", [...WORLD_RECOGNIZED_INSTITUTION_STATUSES])
    .in("id", organizationIds);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return parseWorldPublicInstitutions(data, organizationIds);
}
