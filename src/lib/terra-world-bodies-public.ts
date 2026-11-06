import { supabase } from "@/integrations/supabase/client";

/**
 * Public TG3 institution-body reader. TG2 remains the sole source of organ
 * identity and visibility. All requests are bounded, projection-only and
 * protected both by the existing RLS and explicit public predicates.
 */
export const WORLD_BODIES_PAGE_SIZE = 24;
export const WORLD_BODIES_MAX_PAGE = 1000;
export type WorldBodyStatusFilter = "all" | "active" | "inactive" | "historical";

export function cleanWorldBodySearch(term: string): string {
  // Remove PostgREST filter grammar and LIKE wildcards before constructing a bounded name search.
  return term.normalize("NFC")
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/\s+/g, " ").trim().slice(0, 64);
}
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validWorldSlug(value: string): boolean {
  return value.length <= 80 && slugPattern.test(value);
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

// A PostgREST inner join is the first publication barrier. Verify the
// returned relationship as well, instead of treating a malformed or
// unexpected join payload as a public identity.
function hasPublicOrganizationJoin(input: unknown, organizationId: string): boolean {
  const parent = record(record(input)?.world_organizations);
  return parent?.id === organizationId && parent.public_visibility === "public";
}

function hasPublicBodyJoin(input: unknown, organizationId: string, bodyId: string): boolean {
  const organ = record(record(input)?.world_organization_organs);
  return organ?.id === bodyId && organ.organization_id === organizationId &&
    organ.visibility === "public";
}

export type PublicWorldInstitution = {
  id: string;
  slug: string;
  shortName: string;
  officialName: string;
  status: string;
};

export type PublicWorldBody = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  shortName: string | null;
  type: string;
  description: string | null;
  status: "active" | "inactive" | "historical";
  sortOrder: number;
};

export function decodePublicWorldInstitution(input: unknown, slug: string): PublicWorldInstitution | null {
  const row = record(input);
  if (!row || !validWorldSlug(slug) || row.slug !== slug ||
      row.public_visibility !== "public" ||
      !nonempty(row.id) || !nonempty(row.short_name) ||
      !nonempty(row.official_name) || !nonempty(row.status)) return null;
  return {
    id: row.id,
    slug,
    shortName: row.short_name,
    officialName: row.official_name,
    status: row.status,
  };
}

export function decodePublicWorldBody(input: unknown, organizationId: string): PublicWorldBody | null {
  const row = record(input);
  if (!row || row.organization_id !== organizationId || row.visibility !== "public" ||
      !nonempty(row.id) || !nonempty(row.slug) || !validWorldSlug(row.slug) ||
      !nonempty(row.name) || !nonempty(row.type) ||
      !["active", "inactive", "historical"].includes(String(row.status)) ||
      !Number.isSafeInteger(row.sort_order)) return null;
  return {
    id: row.id,
    organizationId,
    slug: row.slug,
    name: row.name,
    shortName: nonempty(row.short_name) ? row.short_name : null,
    type: row.type,
    description: nonempty(row.description) ? row.description : null,
    status: row.status as PublicWorldBody["status"],
    sortOrder: row.sort_order as number,
  };
}

/** No details are loaded for an unverified public parent organization. */
export async function readPublicWorldInstitution(
  slug: string, signal?: AbortSignal,
): Promise<PublicWorldInstitution | null> {
  if (!validWorldSlug(slug)) return null;
  let request = (supabase as any).from("world_organizations")
    .select("id,slug,short_name,official_name,status,public_visibility")
    .eq("slug", slug).eq("public_visibility", "public");
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error("This institution could not be checked.");
  return decodePublicWorldInstitution(data, slug);
}

export type WorldBodyDirectory = {
  organization: PublicWorldInstitution;
  bodies: PublicWorldBody[];
  total: number;
  page: number;
};

export async function readPublicWorldBodies(
  slug: string, requestedPage: number,
  options: { term?: string; status?: WorldBodyStatusFilter; signal?: AbortSignal } = {},
): Promise<WorldBodyDirectory | null> {
  const organization = await readPublicWorldInstitution(slug, options.signal);
  if (!organization) return null;
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(WORLD_BODIES_MAX_PAGE, requestedPage)) : 0;
  const term = cleanWorldBodySearch(options.term ?? "");
  let request = (supabase as any).from("world_organization_organs")
    .select("id,organization_id,slug,name,short_name,type,status,visibility,sort_order,world_organizations!inner(id,public_visibility)", { count: "exact" })
    .eq("organization_id", organization.id).eq("visibility", "public")
    // A signed-in manager can have additional private RLS permissions.
    // Require a public parent in this SAME read, not just the earlier lookup.
    .eq("world_organizations.public_visibility", "public");
  if (options.status === "active" || options.status === "inactive" || options.status === "historical") {
    request = request.eq("status", options.status);
  }
  if (term) {
    request = request.or("name.ilike.%" + term + "%,short_name.ilike.%" + term + "%");
  }
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error, count } = await request
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("slug", { ascending: true })
    .range(page * WORLD_BODIES_PAGE_SIZE, (page + 1) * WORLD_BODIES_PAGE_SIZE - 1);
  if (error) {
    // PostgREST may return HTTP 416 (PGRST103) instead of [] when a previously
    // published page vanishes. Never trust the error text or old query-cache
    // total. Recount precisely the same public, organization-scoped filter
    // via HEAD only, returning no row data and avoiding a second out-of-range
    // error when zero public bodies remain.
    if (record(error)?.code !== "PGRST103") {
      throw new Error("Public institutional bodies could not be loaded.");
    }
    let recount = (supabase as any).from("world_organization_organs")
      .select("id,world_organizations!inner(id,public_visibility)", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("visibility", "public")
      .eq("world_organizations.public_visibility", "public");
    if (options.status === "active" || options.status === "inactive" || options.status === "historical") {
      recount = recount.eq("status", options.status);
    }
    if (term) {
      recount = recount.or("name.ilike.%" + term + "%,short_name.ilike.%" + term + "%");
    }
    if (options.signal) recount = recount.abortSignal(options.signal);
    const { error: countError, count: verifiedCount } = await recount;
    if (countError || !Number.isSafeInteger(verifiedCount) || verifiedCount < 0 ||
        page * WORLD_BODIES_PAGE_SIZE < verifiedCount) {
      throw new Error("Public institutional bodies could not be verified.");
    }
    return { organization, bodies: [], total: verifiedCount as number, page };
  }
  const offset = page * WORLD_BODIES_PAGE_SIZE;
  if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(data)) {
    throw new Error("Public institutional bodies could not be verified.");
  }
  // Exact count and page rows must agree. A short nonfinal page is not proof
  // that records have been withdrawn; it could also be a truncated response.
  // Only a genuinely out-of-range page can have zero rows with positive count.
  const expectedRows = Math.min(WORLD_BODIES_PAGE_SIZE, Math.max(0, count - offset));
  if (data.length !== expectedRows) {
    throw new Error("Public institutional bodies could not be verified.");
  }
  const bodies = data.map((row: unknown) =>
    hasPublicOrganizationJoin(row, organization.id)
      ? decodePublicWorldBody(row, organization.id) : null);
  if (bodies.some((body: PublicWorldBody | null) => !body)) {
    throw new Error("An institutional body had an invalid public identity.");
  }
  const uniqueIds = new Set(bodies.map((body: PublicWorldBody | null) => body!.id));
  const uniqueSlugs = new Set(bodies.map((body: PublicWorldBody | null) => body!.slug));
  if (uniqueIds.size !== bodies.length || uniqueSlugs.size !== bodies.length) {
    throw new Error("Conflicting institutional body identities were returned.");
  }
  return { organization, bodies: bodies as PublicWorldBody[], total: count, page };
}

export async function readPublicWorldBody(
  slug: string, bodySlug: string, signal?: AbortSignal,
): Promise<{ organization: PublicWorldInstitution; body: PublicWorldBody } | null> {
  if (!validWorldSlug(slug) || !validWorldSlug(bodySlug)) return null;
  const organization = await readPublicWorldInstitution(slug, signal);
  if (!organization) return null;
  let request = (supabase as any).from("world_organization_organs")
    .select("id,organization_id,slug,name,short_name,type,description,status,visibility,sort_order,world_organizations!inner(id,public_visibility)")
    .eq("organization_id", organization.id)
    .eq("slug", bodySlug).eq("visibility", "public")
    .eq("world_organizations.public_visibility", "public");
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error("This institutional body could not be checked.");
  if (data && !hasPublicOrganizationJoin(data, organization.id)) {
    throw new Error("This institutional body's public parent could not be verified.");
  }
  const body = decodePublicWorldBody(data, organization.id);
  if (!body || body.slug !== bodySlug) return null;
  return { organization, body };
}


/**
 * A separate, narrow public-only office lookup for an already verified organ.
 * This reads office definitions, not private terms or officeholder login data.
 * TG2's office RLS additionally excludes private/members-only organs.
 */
export type PublicWorldBodyOffice = {
  id: string;
  organizationId: string;
  organId: string;
  title: string;
  officeType: string;
};

export const WORLD_BODY_OFFICE_LIMIT = 20;

export function decodePublicBodyOffice(
  input: unknown, organizationId: string, organId: string,
): PublicWorldBodyOffice | null {
  const row = record(input);
  if (!row || row.organization_id !== organizationId || row.organ_id !== organId ||
      row.active !== true || !nonempty(row.id) || !nonempty(row.title) ||
      !nonempty(row.office_type)) return null;
  return {
    id: row.id,
    organizationId,
    organId,
    title: row.title,
    officeType: row.office_type,
  };
}

export async function readPublicBodyOffices(
  organization: PublicWorldInstitution, body: PublicWorldBody, signal?: AbortSignal,
): Promise<PublicWorldBodyOffice[]> {
  if (body.organizationId !== organization.id ||
      !validWorldSlug(organization.slug) || !validWorldSlug(body.slug)) {
    throw new Error("Institutional body identity is inconsistent.");
  }
  // TG2 defines both organ_id -> organs(id) and a composite same-organization
  // foreign key. PostgREST requires the explicit constraint hint or the embed
  // is ambiguous (PGRST201), even though the SQL schema itself is valid.
  let request = (supabase as any).from("world_organization_offices")
    .select("id,organization_id,organ_id,title,office_type,active,world_organizations!inner(id,public_visibility),world_organization_organs:world_organization_organs!world_offices_organ_same_organization_fk!inner(id,organization_id,visibility)")
    .eq("organization_id", organization.id)
    .eq("organ_id", body.id)
    .eq("active", true)
    // TG2 grants scoped private-manager reads too. Explicit inner-join public
    // predicates prevent those grants from broadening a public detail screen.
    .eq("world_organizations.public_visibility", "public")
    .eq("world_organization_organs.organization_id", organization.id)
    .eq("world_organization_organs.visibility", "public")
    .order("display_priority", { ascending: true })
    .order("id", { ascending: true });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.limit(WORLD_BODY_OFFICE_LIMIT);
  if (error || !Array.isArray(data) || data.length > WORLD_BODY_OFFICE_LIMIT) {
    throw new Error("Public institutional offices could not be verified.");
  }
  const offices = data.map((row: unknown) =>
    hasPublicOrganizationJoin(row, organization.id) &&
    hasPublicBodyJoin(row, organization.id, body.id)
      ? decodePublicBodyOffice(row, organization.id, body.id) : null);
  if (offices.some((office: PublicWorldBodyOffice | null) => office === null)) {
    throw new Error("An institutional office had an invalid public identity.");
  }
  const ids = offices.map((office: PublicWorldBodyOffice | null) => office!.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate institutional offices were returned.");
  }
  return offices as PublicWorldBodyOffice[];
}
