import { supabase } from "@/integrations/supabase/client";

/**
 * TG3 public reader. All authority remains with TG2's RLS-filtered organization
 * directory and world_organization_projection_v1 RPC (#1888). In particular,
 * never query world proxies, user ids, private grants or office histories here.
 * The generated Supabase types cannot know the unmerged TG2 schema yet.
 */
export type WorldOrganization = {
  id: string;
  slug: string;
  officialName: string;
  shortName: string;
  type: string;
  description: string | null;
  status: string;
};

export type WorldOrgan = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
};

export type WorldMembership = {
  id: string;
  countryId: string;
  status: string;
  membershipType: string;
  endedAt: string | null;
};

export type WorldOffice = {
  id: string;
  title: string;
  currentTerm: null | {
    holderDisplayName: string;
    representedCountryId: string | null;
    startEditionId: string | null;
    endEditionId: string | null;
    status: string;
  };
};

export type WorldProjection = {
  organization: WorldOrganization;
  organs: WorldOrgan[];
  memberships: WorldMembership[];
  offices: WorldOffice[];
};

export type WorldDirectoryFilter = "all" | "current" | "historical";
export const WORLD_DIRECTORY_PAGE_SIZE = 12;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const optionalText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const items = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function parseWorldOrganization(value: unknown): WorldOrganization | null {
  const row = object(value);
  if (!row || !nonempty(row.id) || !nonempty(row.slug) || !nonempty(row.officialName) ||
      !nonempty(row.shortName) || !nonempty(row.type) || !nonempty(row.status) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) return null;
  return {
    id: row.id, slug: row.slug, officialName: row.officialName,
    shortName: row.shortName, type: row.type,
    description: optionalText(row.description), status: row.status,
  };
}

/** Safe failure for missing/unpublished organizations, including future private rows. */
export function parseWorldProjection(input: unknown, requestedSlug: string): WorldProjection | null {
  const raw = object(input);
  const organization = parseWorldOrganization(raw?.organization);
  if (!raw || !organization || organization.slug !== requestedSlug) return null;
  return {
    organization,
    organs: items(raw.organs).flatMap((value) => {
      const row = object(value);
      return row && nonempty(row.id) && nonempty(row.slug) && nonempty(row.name) &&
        nonempty(row.type) && nonempty(row.status)
        ? [{ id: row.id, slug: row.slug, name: row.name, type: row.type, status: row.status }]
        : [];
    }),
    memberships: items(raw.memberships).flatMap((value) => {
      const row = object(value);
      return row && nonempty(row.id) && nonempty(row.countryId) &&
        nonempty(row.status) && nonempty(row.membershipType)
        ? [{ id: row.id, countryId: row.countryId, status: row.status,
          membershipType: row.membershipType, endedAt: optionalText(row.endedAt) }]
        : [];
    }),
    offices: items(raw.offices).flatMap((value) => {
      const row = object(value);
      if (!row || !nonempty(row.id) || !nonempty(row.title)) return [];
      const term = object(row.currentTerm);
      const currentTerm = term && nonempty(term.holderDisplayName) && term.status === "active"
        ? {
            holderDisplayName: term.holderDisplayName,
            representedCountryId: optionalText(term.representedCountryId),
            startEditionId: optionalText(term.startEditionId),
            endEditionId: optionalText(term.endEditionId),
            status: "active",
          }
        : null;
      return [{ id: row.id, title: row.title, currentTerm }];
    }),
  };
}

export function currentWorldMemberships(projection: WorldProjection): WorldMembership[] {
  return projection.memberships.filter((row) =>
    row.endedAt === null && ["member", "associate", "observer", "suspended"].includes(row.status));
}

export function cleanWorldSearch(term: string): string {
  return term.normalize("NFC").replace(/[^\p{L}\p{N} -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 64);
}

export type WorldDirectoryResponse = {
  organizations: WorldOrganization[];
  total: number;
};

export function parseWorldDirectoryRows(raw: unknown): WorldOrganization[] {
  return items(raw).flatMap((value) => {
    const row = object(value);
    if (!row || row.public_visibility !== "public") return [];
    const organization = parseWorldOrganization({
      id: row.id, slug: row.slug, officialName: row.official_name,
      shortName: row.short_name, type: row.type, description: row.description,
      status: row.status,
    });
    return organization ? [organization] : [];
  });
}

export async function fetchWorldDirectory(input: {
  term: string; filter: WorldDirectoryFilter; page: number;
}): Promise<WorldDirectoryResponse> {
  const term = cleanWorldSearch(input.term);
  const page = Math.max(0, Math.min(1000, Math.trunc(input.page) || 0));
  // Only public fields; do not select "*", count members or hydrate per-row profiles.
  let request = (supabase as any).from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status,public_visibility", { count: "exact" })
    .eq("public_visibility", "public")
    .order("official_name", { ascending: true });
  if (input.filter === "current") request = request.in("status", ["active", "recognized", "suspended"]);
  if (input.filter === "historical") request = request.in("status", ["historical", "dissolved"]);
  if (term) request = request.or("official_name.ilike.%" + term + "%,short_name.ilike.%" + term + "%");
  const { data, error, count } = await request.range(
    page * WORLD_DIRECTORY_PAGE_SIZE,
    (page + 1) * WORLD_DIRECTORY_PAGE_SIZE - 1,
  );
  if (error) throw new Error("World organizations are temporarily unavailable.");
  return { organizations: parseWorldDirectoryRows(data), total: Math.max(0, count ?? 0) };
}

/**
 * World landing only needs GUARD/UNITY, not the first page of every future
 * organization. Its single targeted query remains RLS/public-visibility scoped.
 */
export async function fetchFeaturedWorldOrganizations(): Promise<WorldOrganization[]> {
  const { data, error } = await (supabase as any).from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status,public_visibility")
    .eq("public_visibility", "public")
    .in("slug", ["guard", "unity"])
    .order("short_name", { ascending: true });
  if (error) throw new Error("World institutions are temporarily unavailable.");
  return parseWorldDirectoryRows(data);
}

export async function fetchWorldProjection(slug: string): Promise<WorldProjection | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await (supabase as any).rpc("world_organization_projection_v1", {
    p_slug: slug,
  });
  if (error) throw new Error("This organization cannot be loaded right now.");
  return parseWorldProjection(data, slug);
}
