import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { solarisQueryPolicy } from "@/lib/app-query-policy";
import {
  WORLD_DIRECTORY_PAGE_SIZE,
  parseWorldOrganizationDetail,
  parseWorldOrganizationDirectory,
  sanitizeWorldDirectorySearch,
  worldSearchExpression,
  type WorldCountryIdentity,
  type WorldOrganizationDetail,
  type WorldOrganizationFilter,
  type WorldOrganizationSummary,
} from "./world-public-model";

export type WorldDirectoryPage = {
  items: WorldOrganizationSummary[];
  hasNext: boolean;
};

type WorldDirectoryInput = {
  search: string;
  status: WorldOrganizationFilter;
  page: number;
};

export async function fetchWorldDirectoryPage(input: WorldDirectoryInput): Promise<WorldDirectoryPage> {
  const page = Math.max(0, Math.min(1000, Math.trunc(input.page) || 0));
  const search = sanitizeWorldDirectorySearch(input.search);
  const first = page * WORLD_DIRECTORY_PAGE_SIZE;

  // TG2 grants SELECT only on the public-facing institution records under RLS.
  // The explicit visibility predicate is defense in depth, not client authorization.
  // The generated Supabase types are extended by the still-unmerged TG2 migration.
  let query = (supabase as any)
    .from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status,public_visibility")
    .eq("public_visibility", "public")
    .order("official_name", { ascending: true })
    .range(first, first + WORLD_DIRECTORY_PAGE_SIZE);

  if (input.status !== "all") query = query.eq("status", input.status);
  const expression = worldSearchExpression(search);
  if (expression) query = query.or(expression);

  const { data, error } = await query;
  if (error) throw error;
  const rows = parseWorldOrganizationDirectory(data);
  return {
    items: rows.slice(0, WORLD_DIRECTORY_PAGE_SIZE),
    hasNext: rows.length > WORLD_DIRECTORY_PAGE_SIZE,
  };
}

export async function fetchWorldOrganizationDetail(slug: string): Promise<WorldOrganizationDetail | null> {
  // Never send arbitrary identifiers into a SECURITY DEFINER projection.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await (supabase as any).rpc(
    "world_organization_projection_v1",
    { p_slug: slug },
  );
  if (error) throw error;
  return parseWorldOrganizationDetail(data);
}

const MAX_PUBLIC_COUNTRY_IDENTITIES = 100;

export async function fetchWorldCountryIdentities(ids: string[]): Promise<WorldCountryIdentity[]> {
  if (ids.length === 0) return [];
  const requested = [...new Set(ids)].slice(0, MAX_PUBLIC_COUNTRY_IDENTITIES);
  const { data, error } = await supabase
    .from("countries")
    .select("id,name,short_code,flag_image")
    .in("id", requested)
    .limit(MAX_PUBLIC_COUNTRY_IDENTITIES);
  if (error) throw error;
  return (data ?? []).filter(
    (country) => country.id && country.name && country.short_code,
  ).map((country) => ({
    id: country.id,
    name: country.name,
    shortCode: country.short_code,
    flagImage: country.flag_image ?? null,
  }));
}

export function useWorldDirectory(input: WorldDirectoryInput) {
  return useQuery({
    ...solarisQueryPolicy("warm"),
    queryKey: ["world", "public-organizations", input.search, input.status, input.page],
    queryFn: () => fetchWorldDirectoryPage(input),
    retry: 1,
  });
}

export function useWorldOrganization(slug: string) {
  return useQuery({
    ...solarisQueryPolicy("warm"),
    queryKey: ["world", "public-organization", slug],
    enabled: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
    queryFn: () => fetchWorldOrganizationDetail(slug),
    retry: 1,
  });
}

export function useWorldCountryIdentities(ids: string[]) {
  const bounded = [...new Set(ids)].slice(0, MAX_PUBLIC_COUNTRY_IDENTITIES).sort();
  return useQuery({
    ...solarisQueryPolicy("cold"),
    queryKey: ["world", "public-country-identities", bounded],
    enabled: bounded.length > 0,
    queryFn: () => fetchWorldCountryIdentities(bounded),
    retry: 1,
  });
}
