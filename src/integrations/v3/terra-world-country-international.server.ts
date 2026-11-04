import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  WORLD_COUNTRY_MAX_MEMBERSHIPS,
  WORLD_COUNTRY_PAGE_SIZE,
  parseWorldCountry,
  parseWorldCountryDirectory,
  parseWorldCountryInternational,
  worldCountryCode,
  worldCountrySearchTerm,
} from "@/lib/terra-world-country-international";

type PublicWorldClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function publicClient(): PublicWorldClient {
  // Reuse Solaris's existing anonymous runtime. No privileged key, identity
  // overrides or production fallback; the database owns all publication rules.
  return createConfirmationPublicRuntimeClient() as unknown as PublicWorldClient;
}

function requirePublicRead(error: unknown, label: string) {
  if (error) throw new Error(label + " is unavailable");
}

export async function loadTerraWorldCountryDirectory(input: {
  page: number;
  search: string;
}) {
  const term = worldCountrySearchTerm(input.search);
  const first = input.page * WORLD_COUNTRY_PAGE_SIZE;
  let query = publicClient()
    .from("countries")
    .select("id,name,short_code,region,flag_image", { count: "exact" });

  if (term) {
    // PostgREST grammar punctuation is stripped by worldCountrySearchTerm.
    query = query.or("name.ilike.%" + term + "%,short_code.ilike.%" + term + "%");
  }
  const { data, count, error } = await query
    .order("name", { ascending: true })
    .range(first, first + WORLD_COUNTRY_PAGE_SIZE - 1);

  requirePublicRead(error, "Terra Solaris country discovery");
  return parseWorldCountryDirectory(data, count, input.page);
}

/**
 * Published country identity + publicly visible international memberships.
 * No delegation credential, raw office grant, proxy or private representation
 * is queried. Related organizational identity comes only from public RLS.
 */
export async function loadTerraWorldCountryInternational(rawCode: string) {
  const code = worldCountryCode(rawCode);
  const client = publicClient();

  const { data: countryData, error: countryError } = await client
    .from("countries")
    .select("id,name,short_code,region,flag_image")
    .ilike("short_code", code)
    .maybeSingle();
  requirePublicRead(countryError, "Terra Solaris country");
  if (!countryData) return null;

  const country = parseWorldCountry(countryData);
  if (country.code !== code) throw new Error("Country code mismatch");

  // TG1 owns the durable display name, fictional government and verified
  // historical controller. Missing controllers must remain unconfirmed.
  const [identityResult, membershipResult] = await Promise.all([
    client.rpc("world_country_identity_v1", { p_country_id: country.id }),
    client
      .from("world_organization_memberships")
      .select(
        "id,organization_id,country_id,membership_type,status,joined_at,ended_at",
        { count: "exact" },
      )
      .eq("country_id", country.id)
      .order("joined_at", { ascending: false })
      .limit(WORLD_COUNTRY_MAX_MEMBERSHIPS),
  ]);
  requirePublicRead(identityResult.error, "Terra Solaris public country identity");
  requirePublicRead(membershipResult.error, "Terra Solaris institutional memberships");

  if (!Number.isSafeInteger(membershipResult.count) || membershipResult.count < 0 ||
      membershipResult.count > WORLD_COUNTRY_MAX_MEMBERSHIPS) {
    // Do not claim a truncated membership list is the complete current truth.
    throw new Error("Institutional membership list is not fully available");
  }

  const memberships = membershipResult.data ?? [];
  const ids = [...new Set(
    memberships.map((row: { organization_id?: unknown }) => row.organization_id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
  )];

  let publicOrganizations: unknown[] = [];
  if (ids.length) {
    const { data, error } = await client
      .from("world_organizations")
      .select("id,slug,short_name")
      .eq("public_visibility", "public")
      .in("id", ids)
      .limit(WORLD_COUNTRY_MAX_MEMBERSHIPS);
    requirePublicRead(error, "Terra Solaris public organization identities");
    publicOrganizations = data ?? [];
  }

  return parseWorldCountryInternational(
    countryData,
    identityResult.data,
    memberships,
    publicOrganizations,
  );
}
