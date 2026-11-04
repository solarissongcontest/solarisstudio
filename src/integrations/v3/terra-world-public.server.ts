import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  WORLD_DIRECTORY_PAGE_SIZE,
  normalizeWorldDirectorySearch,
  parseWorldCountries,
  parseWorldDirectory,
  parseWorldOrganizationDetail,
  type WorldDirectoryStatus,
} from "@/lib/terra-world-public";

type WorldPublicClient = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
function client(): WorldPublicClient {
  // Uses the existing read-only public runtime. Never service_role or a new
  // hosted fallback client. TG2 RLS controls visibility.
  return createConfirmationPublicRuntimeClient() as unknown as WorldPublicClient;
}
function requireSuccess(error: unknown, scope: string): void {
  if (error) throw new Error(scope + " is currently unavailable");
}

const DIRECTORY_FIELDS =
  "id,slug,official_name,short_name,type,description,emblem_url,banner_url,status,revision";

export async function loadTerraWorldDirectory(input: {
  page: number;
  search: string;
  status: WorldDirectoryStatus;
}) {
  const offset = input.page * WORLD_DIRECTORY_PAGE_SIZE;
  const term = normalizeWorldDirectorySearch(input.search);
  let query = client()
    .from("world_organizations")
    .select(DIRECTORY_FIELDS, { count: "exact" })
    .eq("public_visibility", "public");

  if (input.status !== "all") query = query.eq("status", input.status);
  if (term) {
    // The grammar is bounded to letters, digits, spaces and hyphens.
    // No user-controlled PostgREST punctuation reaches the .or filter.
    query = query.or("short_name.ilike.%" + term + "%,official_name.ilike.%" + term + "%");
  }

  const { data, count, error } = await query
    .order("short_name", { ascending: true })
    .range(offset, offset + WORLD_DIRECTORY_PAGE_SIZE - 1);

  requireSuccess(error, "Terra Solaris directory");
  return parseWorldDirectory(data, count, input.page);
}

export async function loadTerraWorldOrganization(slug: string) {
  const source = client();
  const { data, error } = await source.rpc("world_organization_projection_v1", {
    p_slug: slug,
  });
  requireSuccess(error, "Terra Solaris organization");
  const detail = parseWorldOrganizationDetail(data);
  if (!detail) return null;

  const countryIds = [...new Set([
    ...detail.memberships.map((member) => member.countryId),
    ...detail.representatives.map((person) => person.countryId),
  ])];
  if (!countryIds.length) return detail;

  // Country identifiers are never displayed as invented country names.
  // Membership/representation data is already filtered by TG2's published
  // projection. Enrichment reads only the related public country identities.
  const { data: countries, error: countryError } = await source
    .from("countries")
    .select("id,name,short_code,flag_image")
    .in("id", countryIds)
    .order("name", { ascending: true })
    .limit(250);

  requireSuccess(countryError, "Terra Solaris country identities");
  return { ...detail, countries: parseWorldCountries(countries) };
}
