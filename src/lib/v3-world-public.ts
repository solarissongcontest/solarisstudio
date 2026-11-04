import { supabase } from "@/integrations/supabase/client";

export const WORLD_PAGE_SIZE = 18;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEARCH_PATTERN = /^[\p{L}\p{N} -]{1,60}$/u;
const ACTIVE_MEMBERSHIP = new Set(["member", "observer", "associate", "suspended"]);

export type WorldOrganizationStatus =
  | "proposed" | "recognized" | "active" | "suspended" | "dissolved" | "historical";
export type WorldDirectoryFilter = "all" | WorldOrganizationStatus;

export interface WorldOrganization {
  id: string;
  slug: string;
  officialName: string;
  shortName: string;
  type: string;
  description: string | null;
  status: WorldOrganizationStatus;
}

export interface WorldOrgan {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  type: string;
  status: string;
}

export interface WorldMembership {
  id: string;
  countryId: string;
  membershipType: string;
  status: string;
  joinedAt: string | null;
  endedAt: string | null;
}

export interface WorldRepresentative {
  id: string;
  countryId: string;
  displayName: string;
  role: string;
  votingAuthority: boolean;
  endsAt: string | null;
}

export interface WorldOffice {
  id: string;
  title: string;
  appointmentMethod: string;
  termLengthEditions: number | null;
  currentTerm: {
    holderDisplayName: string;
    representedCountryId: string | null;
    startEditionId: string | null;
    endEditionId: string | null;
    status: string;
  } | null;
}

export interface WorldOrganizationDetail {
  organization: WorldOrganization;
  organs: WorldOrgan[];
  memberships: WorldMembership[];
  representatives: WorldRepresentative[];
  offices: WorldOffice[];
}

export interface WorldCountryIdentity {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
}

type ReadResult = { data: unknown; error: { message: string } | null };
type ListQuery = {
  select(columns: string): ListQuery;
  eq(column: string, value: string): ListQuery;
  or(filters: string): ListQuery;
  in(column: string, values: string[]): ListQuery;
  order(column: string, options: { ascending: boolean }): ListQuery;
  range(start: number, end: number): Promise<ReadResult>;
  limit(limit: number): Promise<ReadResult>;
};
type PublicWorldReadClient = {
  from(table: string): ListQuery;
  rpc(functionName: string, params: { p_slug: string }): Promise<ReadResult>;
};

// The TG2 migration is stacked on #1888; generated Database types will be
// regenerated at integration. This adapter is read-only and deliberately narrow.
const worldRead = supabase as unknown as PublicWorldReadClient;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function nullable(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((row): row is Record<string, unknown> => row !== null) : [];
}

export function canonicalWorldSlug(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return SLUG_PATTERN.test(normalized) && normalized.length <= 80 ? normalized : null;
}

export function worldSearchTerm(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 60);
  // PostgREST's .or() accepts filter syntax. Never insert punctuation or
  // operators supplied by a visitor into that syntax.
  return SEARCH_PATTERN.test(normalized) ? normalized : "";
}

export function parseWorldOrganization(value: unknown): WorldOrganization | null {
  const row = object(value);
  if (!row) return null;
  const slug = canonicalWorldSlug(str(row.slug));
  const officialName = str(row.officialName ?? row.official_name).trim();
  const shortName = str(row.shortName ?? row.short_name).trim();
  const status = str(row.status) as WorldOrganizationStatus;
  const allowed: WorldOrganizationStatus[] = [
    "proposed", "recognized", "active", "suspended", "dissolved", "historical",
  ];
  if (!slug || !str(row.id) || !officialName || !shortName || !allowed.includes(status)) return null;
  return {
    id: str(row.id),
    slug,
    officialName,
    shortName,
    type: str(row.type) || "organization",
    description: nullable(row.description),
    status,
  };
}

export function parseWorldOrganizationProjection(value: unknown, expectedSlug: string): WorldOrganizationDetail | null {
  const root = object(value);
  if (!root) return null;
  const organization = parseWorldOrganization(root.organization);
  if (!organization || organization.slug !== canonicalWorldSlug(expectedSlug)) return null;
  return {
    organization,
    organs: records(root.organs).filter((row) => str(row.id) && str(row.name)).map((row) => ({
      id: str(row.id), slug: str(row.slug), name: str(row.name),
      shortName: nullable(row.shortName), type: str(row.type), status: str(row.status),
    })),
    memberships: records(root.memberships).filter((row) => str(row.id) && str(row.countryId)).map((row) => ({
      id: str(row.id), countryId: str(row.countryId),
      membershipType: str(row.membershipType), status: str(row.status),
      joinedAt: nullable(row.joinedAt), endedAt: nullable(row.endedAt),
    })),
    representatives: records(root.representatives)
      .filter((row) => str(row.id) && str(row.countryId) && str(row.displayName))
      .map((row) => ({
        id: str(row.id), countryId: str(row.countryId), displayName: str(row.displayName),
        role: str(row.role), votingAuthority: row.votingAuthority === true,
        endsAt: nullable(row.endsAt),
      })),
    offices: records(root.offices).filter((row) => str(row.id) && str(row.title)).map((row) => {
      const term = object(row.currentTerm);
      return {
        id: str(row.id), title: str(row.title),
        appointmentMethod: str(row.appointmentMethod),
        termLengthEditions: typeof row.defaultTermLengthEditions === "number" ? row.defaultTermLengthEditions : null,
        currentTerm: term && str(term.holderDisplayName) ? {
          holderDisplayName: str(term.holderDisplayName),
          representedCountryId: nullable(term.representedCountryId),
          startEditionId: nullable(term.startEditionId),
          endEditionId: nullable(term.endEditionId),
          status: str(term.status),
        } : null,
      };
    }),
  };
}

export function currentWorldMemberships(detail: WorldOrganizationDetail): WorldMembership[] {
  return detail.memberships.filter((item) => item.endedAt === null && ACTIVE_MEMBERSHIP.has(item.status));
}

export function currentWorldRepresentatives(detail: WorldOrganizationDetail): WorldRepresentative[] {
  return detail.representatives.filter((item) => item.endsAt === null && item.votingAuthority);
}

export async function loadWorldOrganizationPage(
  search: string,
  filter: WorldDirectoryFilter,
  page: number,
): Promise<{ organizations: WorldOrganization[]; hasMore: boolean }> {
  if (!Number.isSafeInteger(page) || page < 0 || page > 100) throw new Error("Invalid directory page");
  const term = worldSearchTerm(search);
  // Fail closed on unsupported search operators; never turn unsafe text into an
  // accidentally unfiltered, broad read.
  if (search.trim() && !term) return { organizations: [], hasMore: false };
  let query = worldRead.from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status")
    .eq("public_visibility", "public");
  if (filter !== "all") query = query.eq("status", filter);
  if (term) query = query.or("official_name.ilike.*" + term + "*,short_name.ilike.*" + term + "*");
  const offset = page * WORLD_PAGE_SIZE;
  const { data, error } = await query.order("official_name", { ascending: true })
    .range(offset, offset + WORLD_PAGE_SIZE);
  if (error) throw new Error("World directory unavailable: " + error.message);
  if (!Array.isArray(data)) throw new Error("Unexpected world directory response");
  const parsed = data.map(parseWorldOrganization);
  if (parsed.some((row) => row === null)) throw new Error("Invalid world directory projection");
  return { organizations: (parsed as WorldOrganization[]).slice(0, WORLD_PAGE_SIZE), hasMore: data.length > WORLD_PAGE_SIZE };
}

export async function loadWorldOrganizationDetail(slug: string): Promise<WorldOrganizationDetail | null> {
  const canonicalSlug = canonicalWorldSlug(slug);
  if (!canonicalSlug) return null;
  const { data, error } = await worldRead.rpc("world_organization_projection_v1", { p_slug: canonicalSlug });
  if (error) throw new Error("World organization unavailable: " + error.message);
  if (data === null) return null;
  const detail = parseWorldOrganizationProjection(data, canonicalSlug);
  if (!detail) throw new Error("Invalid public organization projection");
  return detail;
}

export async function loadWorldCountryIdentities(ids: string[]): Promise<WorldCountryIdentity[]> {
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!unique.length) return [];
  const { data, error } = await worldRead.from("countries")
    .select("id,name,short_code,flag_image,accent_color").in("id", unique).limit(100);
  if (error) throw new Error("Country identities unavailable: " + error.message);
  if (!Array.isArray(data)) throw new Error("Unexpected country identities response");
  return records(data).filter((row) => str(row.id) && str(row.name)).map((row) => ({
    id: str(row.id), name: str(row.name), shortCode: str(row.short_code),
    flagImage: nullable(row.flag_image), accentColor: str(row.accent_color) || "#376ba1",
  }));
}
