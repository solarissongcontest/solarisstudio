import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { solarisQueryPolicy } from "@/lib/app-query-policy";
import { isWorldMembershipRoute, readWorldCountryMembership } from "@/lib/world-membership-history";

export type WorldMembershipCountry = {
  id: string;
  name: string;
  code: string;
  flagImage: string | null;
};

export async function fetchWorldMembershipCountry(code: string): Promise<WorldMembershipCountry | null> {
  if (!/^[A-Za-z0-9-]{1,12}$/.test(code)) return null;
  const { data, error } = await supabase.from("countries")
    .select("id,name,short_code,flag_image")
    .eq("short_code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (
    typeof data.id !== "string" || !data.id ||
    typeof data.name !== "string" || !data.name.trim() ||
    typeof data.short_code !== "string" ||
    data.short_code.toUpperCase() !== code.toUpperCase()
  ) {
    throw new Error("Public country identity did not match the requested country");
  }
  return {
    id: data.id,
    name: data.name,
    code: data.short_code,
    flagImage: data.flag_image ?? null,
  };
}

export async function fetchWorldMembershipHistory(slug: string, countryId: string) {
  if (!isWorldMembershipRoute(slug, "A") || !/^[A-Za-z0-9-]{1,64}$/.test(countryId)) return null;
  // The TG2 SECURITY DEFINER projection is explicitly public-only. The browser
  // never reads auth-linked representation tables or private proxy records.
  const { data, error } = await (supabase as any).rpc(
    "world_organization_projection_v1",
    { p_slug: slug },
  );
  if (error) throw error;
  return readWorldCountryMembership(data, slug, countryId);
}

export function useWorldMembershipCountry(code: string, routeValid = true) {
  return useQuery({
    ...solarisQueryPolicy("cold"),
    queryKey: ["world", "membership-country-identity", code.toUpperCase()],
    enabled: routeValid && /^[A-Za-z0-9-]{1,12}$/.test(code),
    queryFn: () => fetchWorldMembershipCountry(code),
    retry: 1,
  });
}

export function useWorldMembershipHistory(slug: string, countryId: string | undefined, routeValid = true) {
  return useQuery({
    ...solarisQueryPolicy("warm"),
    queryKey: ["world", "organization-country-history", slug, countryId],
    enabled: routeValid && isWorldMembershipRoute(slug, "A") && Boolean(countryId),
    queryFn: () => fetchWorldMembershipHistory(slug, countryId!),
    retry: 1,
  });
}
