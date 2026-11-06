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

type PublicClient = {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};
function publicClient(): PublicClient {
  // Existing public Solaris runtime, TG2 RLS and canonical membership.
  // Never use service_role, a privileged identity override or hosted test fallback.
  return createConfirmationPublicRuntimeClient() as unknown as PublicClient;
}
function assertSuccess(error: unknown, label: string) {
  if (error) throw new Error("Could not load public " + label);
}

/**
 * A direct server-function invocation must not bypass the World rollout gate.
 * Do not read membership or institution tables if the flag is absent, disabled
 * or unverified, even when TG2 public RLS would otherwise return records.
 */
async function requireWorldPublication(client: PublicClient): Promise<void> {
  const { data, error } = await client.rpc("studio2_feature_enabled", {
    p_key: "terra_world_public",
    p_edition_id: null,
  });
  if (error || data !== true) {
    throw new Error("Terra Solaris public World rollout could not be verified");
  }
}

async function readPublishedInstitutions(client: PublicClient) {
  const { data, count, error } = await client.from("world_organizations")
    .select("id,slug,short_name,public_visibility", { count: "exact" })
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
  // Filter choices are a separate, long-lived cached query on the client.
  // They are NOT fetched again in every history page request.
  const client = publicClient();
  await requireWorldPublication(client);
  return readPublishedInstitutions(client);
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
  await requireWorldPublication(client);

  let selectedOrganization: { id: string; slug: string; short_name: string } | null = null;
  if (organizationSlug) {
    const { data, error } = await client.from("world_organizations")
      .select("id,slug,short_name,public_visibility")
      .eq("public_visibility", "public")
      .eq("slug", organizationSlug)
      .maybeSingle();
    assertSuccess(error, "selected institution");
    selectedOrganization = data;
    // Do not reveal whether an inaccessible organization exists.
    if (!selectedOrganization) {
      return { records: [], total: 0, page: input.page, scope: input.scope };
    }
  }

  let countryId: string | null = null;
  if (countryCode) {
    const { data, error } = await client.from("countries")
      .select("id,short_code")
      .eq("short_code", countryCode)
      .maybeSingle();
    assertSuccess(error, "Terra Solaris country identity");
    countryId = data?.id ?? null;
    if (!countryId) {
      return { records: [], total: 0, page: input.page, scope: input.scope };
    }
  }

  let query = client.from("world_organization_memberships")
    .select("id,organization_id,country_id,membership_type,status,joined_at,ended_at", { count: "exact" });

  if (selectedOrganization) query = query.eq("organization_id", selectedOrganization.id);
  if (countryId) query = query.eq("country_id", countryId);
  if (input.scope === "current") query = query.is("ended_at", null);
  if (input.scope === "ended") query = query.not("ended_at", "is", null);

  const from = input.page * WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE;
  const { data: memberships, count, error } = await query
    .order("joined_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE - 1);
  assertSuccess(error, "institutional membership history");

  // Query just the institutions actually referenced on the displayed page.
  // Avoid re-downloading the entire 100-institution selector on every page.
  const organizationIds: string[] = [...new Set(
    (memberships ?? []).map((row: { organization_id?: unknown }) => row.organization_id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
  )];
  let organizations: unknown[] = [];
  if (selectedOrganization) {
    organizations = [selectedOrganization];
  } else if (organizationIds.length) {
    const result = await client.from("world_organizations")
      .select("id,slug,short_name,public_visibility")
      .eq("public_visibility", "public")
      .in("id", organizationIds)
      .limit(WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE);
    assertSuccess(result.error, "public institution identities");
    organizations = result.data ?? [];
  }

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
    organizations,
    countries,
    count,
    page: input.page,
    scope: input.scope,
  });
}
