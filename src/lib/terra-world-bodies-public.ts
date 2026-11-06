import { supabase } from "@/integrations/supabase/client";

/**
 * Public TG3 institution-body reader. TG2 remains the sole source of organ
 * identity and visibility. All requests are bounded, projection-only and
 * protected both by the existing RLS and explicit public predicates.
 */
export const WORLD_BODIES_PAGE_SIZE = 24;
export type WorldBodyStatusFilter = "all" | "active" | "historical";

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
export async function readPublicWorldInstitution(slug: string): Promise<PublicWorldInstitution | null> {
  if (!validWorldSlug(slug)) return null;
  const { data, error } = await (supabase as any).from("world_organizations")
    .select("id,slug,short_name,official_name,status,public_visibility")
    .eq("slug", slug).eq("public_visibility", "public").maybeSingle();
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
  options: { term?: string; status?: WorldBodyStatusFilter } = {},
): Promise<WorldBodyDirectory | null> {
  const organization = await readPublicWorldInstitution(slug);
  if (!organization) return null;
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(1000, requestedPage)) : 0;
  const term = cleanWorldBodySearch(options.term ?? "");
  let request = (supabase as any).from("world_organization_organs")
    .select("id,organization_id,slug,name,short_name,type,status,visibility,sort_order", { count: "exact" })
    .eq("organization_id", organization.id).eq("visibility", "public");
  if (options.status === "active" || options.status === "historical") {
    request = request.eq("status", options.status);
  }
  if (term) {
    request = request.or("name.ilike.%" + term + "%,short_name.ilike.%" + term + "%");
  }
  const { data, error, count } = await request
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("slug", { ascending: true })
    .range(page * WORLD_BODIES_PAGE_SIZE, (page + 1) * WORLD_BODIES_PAGE_SIZE - 1);
  if (error) throw new Error("Public institutional bodies could not be loaded.");
  if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(data) ||
      data.length > WORLD_BODIES_PAGE_SIZE ||
      (page * WORLD_BODIES_PAGE_SIZE + data.length > count)) {
    throw new Error("Public institutional bodies could not be verified.");
  }
  const bodies = data.map((row: unknown) => decodePublicWorldBody(row, organization.id));
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
  slug: string, bodySlug: string,
): Promise<{ organization: PublicWorldInstitution; body: PublicWorldBody } | null> {
  if (!validWorldSlug(slug) || !validWorldSlug(bodySlug)) return null;
  const organization = await readPublicWorldInstitution(slug);
  if (!organization) return null;
  const { data, error } = await (supabase as any).from("world_organization_organs")
    .select("id,organization_id,slug,name,short_name,type,description,status,visibility,sort_order")
    .eq("organization_id", organization.id)
    .eq("slug", bodySlug).eq("visibility", "public").maybeSingle();
  if (error) throw new Error("This institutional body could not be checked.");
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
  organization: PublicWorldInstitution, body: PublicWorldBody,
): Promise<PublicWorldBodyOffice[]> {
  if (body.organizationId !== organization.id ||
      !validWorldSlug(organization.slug) || !validWorldSlug(body.slug)) {
    throw new Error("Institutional body identity is inconsistent.");
  }
  const { data, error } = await (supabase as any).from("world_organization_offices")
    .select("id,organization_id,organ_id,title,office_type,active")
    .eq("organization_id", organization.id)
    .eq("organ_id", body.id)
    .eq("active", true)
    .order("display_priority", { ascending: true })
    .order("id", { ascending: true })
    .limit(WORLD_BODY_OFFICE_LIMIT);
  if (error || !Array.isArray(data) || data.length > WORLD_BODY_OFFICE_LIMIT) {
    throw new Error("Public institutional offices could not be verified.");
  }
  const offices = data.map((row: unknown) =>
    decodePublicBodyOffice(row, organization.id, body.id));
  if (offices.some((office: PublicWorldBodyOffice | null) => office === null)) {
    throw new Error("An institutional office had an invalid public identity.");
  }
  const ids = offices.map((office: PublicWorldBodyOffice | null) => office!.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate institutional offices were returned.");
  }
  return offices as PublicWorldBodyOffice[];
}
