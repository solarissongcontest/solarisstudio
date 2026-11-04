import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  WORLD_MEMBERSHIP_CHRONICLE_ORGANIZATION_LIMIT,
  WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE,
  normalizeWorldChronicleCountryCode,
  normalizeWorldChronicleOrganizationSlug,
  parseWorldChronicleInstitutions,
  parseWorldMembershipChronicle,
  type WorldMembershipChronicleScope,
} from "@/lib/terra-world-membership-chronicle";

type PublicClient = { from(table: string): any };
function publicClient(): PublicClient {
  // Only existing public Solaris runtime, RLS and TG2 canonical membership.
  // Never use service_role, unbounded retries or hosted test fallback.
  return createConfirmationPublicRuntimeClient() as unknown as PublicClient;
}
function assertSuccess(error: unknown, label: string) {
  if (error) throw new Error("Could not load public " + label);
}

async function readPublishedInstitutions(client: PublicClient) {
  const { data, count, error } = await client.from("world_organizations")
    .select("id,slug,short_name", { count: "exact" })
    .eq("public_visibility", "public")
    .order("short_name", { ascending: true })
    .limit(WORLD_MEMBERSHIP_CHRONICLE_ORGANIZATION_LIMIT);
  assertSuccess(error, "Terra Solaris institutions");
  if (!Number.isSafeInteger(count) || count < 0 ||
      count > WORLD_MEMBERSHIP_CHRONICLE_ORGANIZATION_LIMIT) {
    throw new Error("Complete public institutional directory unavailable");
  }
  return parseWorldChronicleInstitutions(data);
}

export async function loadWorldMembershipInstitutions() {
  return readPublishedInstitutions(publicClient());
}

export async function loadWorldMembershipChronicle(input: {
  page: number;
  organization: string;
  country: string;
  scope: WorldMembershipChronicleScope;
}) {
  const organizationSlug = normalizeWorldChronicleOrganizationSlug(input.organization);
  const countryCode = normalizeWorldChronicleCountryCode(input.country);
  const client = publicClient();

  const institutions = await readPublishedInstitutions(client);
  const institution = organizationSlug
    ? institutions.find((item) => item.slug === organizationSlug)
    : null;

  // Unknown/private organization never becomes an oracle for membership data.
  if (organizationSlug && !institution) {
    return { records: [], total: 0, page: input.page, scope: input.scope };
  }

  let countryId: string | null = null;
  if (countryCode) {
    const { data, error } = await client.from("countries")
      .select("id,short_code")
      .ilike("short_code", countryCode)
      .maybeSingle();
    assertSuccess(error, "Terra Solaris country identity");
    countryId = data?.id ?? null;
    if (!countryId) {
      return { records: [], total: 0, page: input.page, scope: input.scope };
    }
  }

  let query = client.from("world_organization_memberships")
    .select("id,organization_id,country_id,membership_type,status,joined_at,ended_at", { count: "exact" });

  if (institution) query = query.eq("organization_id", institution.id);
  if (countryId) query = query.eq("country_id", countryId);
  if (input.scope === "current") query = query.is("ended_at", null);
  if (input.scope === "ended") query = query.not("ended_at", "is", null);

  const from = input.page * WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE;
  const { data: memberships, count, error } = await query
    .order("joined_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE - 1);
  assertSuccess(error, "institutional membership history");

  const countryIds: string[] = [...new Set(
    (memberships ?? []).map((row: { country_id?: unknown }) => row.country_id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
  )];
  let countries: unknown[] = [];
  if (countryIds.length) {
    const countryResult = await client.from("countries")
      .select("id,name,short_code,flag_image")
      .in("id", countryIds)
      .limit(WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE);
    assertSuccess(countryResult.error, "member-country identities");
    countries = countryResult.data ?? [];
  }

  return parseWorldMembershipChronicle({
    rows: memberships,
    organizations: institutions.map((item) => ({
      id: item.id, slug: item.slug, short_name: item.shortName,
    })),
    countries,
    count,
    page: input.page,
    scope: input.scope,
  });
}
