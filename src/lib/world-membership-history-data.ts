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
  // The SQL signature accepts UUID, not a free-form country lookup. Reject
  // malformed inputs before calling the public SECURITY DEFINER projection.
  if (!isWorldMembershipRoute(slug, "A") ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(countryId)) return null;
  // This new SECURITY DEFINER read is constrained in SQL to one published
  // organization and one country ID, avoiding organization-wide history
  // downloads. It reuses TG2 authority; no private direct table reads.
  const { data, error } = await (supabase as any).rpc(
    "world_public_country_membership_history_v1",
    { p_slug: slug, p_country_id: countryId },
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
