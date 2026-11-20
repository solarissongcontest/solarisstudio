import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  parseGovernmentArticles,
  parseGovernmentCountry,
  parseGovernmentProfile,
  validGovernmentCountryCode,
  type GovernmentPublicRead,
} from "@/lib/world-country-government";

const ARTICLES_LIMIT = 60;

// The checked-in generated Database type omits this existing country-profile extension.
// Follow country-account.ts: keep the untyped escape confined to these two tables,
// explicitly project public columns and validate every returned row below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countryProfileClient = supabase as any;

/** Three narrowly scoped public reads, never private profile tables or account data. */
export async function loadCountryGovernment(code: string, signal?: AbortSignal): Promise<GovernmentPublicRead | null> {
  if (!validGovernmentCountryCode(code)) return null;
  if (signal?.aborted) throw new DOMException("Government read cancelled", "AbortError");
  let countryRequest = supabase
    .from("countries")
    .select("id,name,native_name,short_code,region,flag_image")
    .ilike("short_code", code)
    .limit(1);
  if (signal) countryRequest = countryRequest.abortSignal(signal);
  const { data: countryRow, error: countryError } = await countryRequest.maybeSingle();
  if (countryError) throw countryError;
  const country = parseGovernmentCountry(countryRow, code);
  if (!country) return null;
  let profileRequest = countryProfileClient.from("country_profiles")
    .select("country_id,government_type,leader_title,leader_name,capital,summary,updated_at")
    .eq("country_id", country.id);
  let sectionRequest = countryProfileClient.from("country_profile_sections")
    .select("id,country_id,heading,body,sort_order,visible_on_country,visible_on_wiki")
    .eq("country_id", country.id)
    .or("visible_on_country.eq.true,visible_on_wiki.eq.true")
    .order("sort_order", { ascending: true })
    .limit(ARTICLES_LIMIT + 1);
  if (signal) {
    profileRequest = profileRequest.abortSignal(signal);
    sectionRequest = sectionRequest.abortSignal(signal);
  }
  const [profileResult, sectionsResult] = await Promise.all([
    profileRequest.maybeSingle(),
    sectionRequest,
  ]);
  if (profileResult.error) throw profileResult.error;
  if (sectionsResult.error) throw sectionsResult.error;
  const sections = sectionsResult.data ?? [];
  const truncated = sections.length > ARTICLES_LIMIT;
  return {
    country,
    profile: parseGovernmentProfile(profileResult.data, country.id),
    articles: parseGovernmentArticles(sections.slice(0, ARTICLES_LIMIT), country.id),
    sectionsTruncated: truncated,
  };
}

export function useCountryGovernment(code: string) {
  return useQuery({
    queryKey: ["world", "public-government", code.toLowerCase()],
    queryFn: ({ signal }) => loadCountryGovernment(code, signal),
    enabled: validGovernmentCountryCode(code),
    staleTime: 5 * 60_000,
    // Refetch on return to the page; stale published material is hidden by the UI.
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
}