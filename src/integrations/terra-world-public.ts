import { supabase as baseSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORLD_ORGANIZATIONS_PAGE_SIZE,
  normalizedWorldSearch,
  parseWorldDirectoryRow,
  parseWorldMemberCountry,
  parseWorldOrganizationDetail,
  type WorldDirectoryFilter,
  type WorldDirectoryPage,
  type WorldMemberCountry,
  type WorldOrganizationDetail,
} from "@/lib/terra-world-public";

/** Read-only TG2 consumer. Generated DB types are on the unmerged upstream branch. */
const supabase = baseSupabase as unknown as SupabaseClient;

export async function loadWorldOrganizations(input: {
  page: number; search: string; status: WorldDirectoryFilter;
}): Promise<WorldDirectoryPage> {
  const page = Math.max(0, Math.min(100, Math.trunc(input.page) || 0));
  const offset = page * WORLD_ORGANIZATIONS_PAGE_SIZE;
  let request = supabase.from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,emblem_url,status,public_visibility")
    .eq("public_visibility", "public")
    .order("short_name", { ascending: true })
    .range(offset, offset + WORLD_ORGANIZATIONS_PAGE_SIZE);

  if (input.status !== "all") request = request.eq("status", input.status);
  const search = normalizedWorldSearch(input.search);
  if (search) request = request.or(
    "short_name.ilike.%" + search + "%,official_name.ilike.%" + search + "%",
  );
  const { data, error } = await request;
  if (error) throw error;
  const raw = data ?? [];
  const parsed = raw.map(parseWorldDirectoryRow);
  if (parsed.some((row) => !row)) throw new Error("Invalid or nonpublic organization row");
  return {
    rows: parsed.slice(0, WORLD_ORGANIZATIONS_PAGE_SIZE) as NonNullable<(typeof parsed)[number]>[],
    hasNext: raw.length > WORLD_ORGANIZATIONS_PAGE_SIZE,
  };
}

export async function loadWorldOrganization(slug: string): Promise<WorldOrganizationDetail | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await supabase.rpc("world_organization_projection_v1", { p_slug: slug });
  if (error) throw error;
  if (data == null) return null;
  const result = parseWorldOrganizationDetail(data);
  if (!result || result.organization.slug !== slug) {
    throw new Error("Invalid or mismatched public organization projection");
  }
  return result;
}

export async function loadWorldMemberCountries(ids: readonly string[]): Promise<WorldMemberCountry[]> {
  if (!ids.length) return [];
  if (ids.length > 20) throw new Error("World member country query exceeds page budget");
  const { data, error } = await supabase.from("countries")
    .select("id,name,short_code,flag_image")
    .in("id", [...new Set(ids)])
    .limit(20);
  if (error) throw error;
  const parsed = (data ?? []).map(parseWorldMemberCountry);
  if (parsed.some((country) => !country)) throw new Error("Invalid public country identity");
  return parsed as WorldMemberCountry[];
}
