import { supabase } from "@/integrations/supabase/client";

/**
 * TG3 public reader. All authority remains with TG2's RLS-filtered organization
 * directory and world_organization_projection_v1 RPC (#1888). In particular,
 * never query world proxies, user ids, private grants or office histories here.
 * The generated Supabase types cannot know the unmerged TG2 schema yet.
 */
export const WORLD_PUBLIC_ROLLOUT_KEY = "terra_world_public" as const;

/** Unknown flags and absent rollout contracts always resolve disabled. */
export async function fetchWorldPublicEnabled(): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("studio2_feature_enabled", {
    p_key: WORLD_PUBLIC_ROLLOUT_KEY,
    p_edition_id: null,
  });
  if (error) throw new Error("World availability cannot be verified.");
  return data === true;
}

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

export type WorldRepresentative = {
  id: string;
  countryId: string;
  displayName: string;
  role: string;
  votingAuthority: boolean;
  endsAt: string | null;
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
  representatives: WorldRepresentative[];
  offices: WorldOffice[];
};

/**
 * Publication lifecycle shared by the World landing and World Search. A
 * proposed union is not yet an officially recognized public institution.
 */
export const WORLD_PUBLIC_INSTITUTION_STATUSES = [
  "recognized", "active", "suspended", "historical", "dissolved",
] as const;

export function isPublicWorldInstitutionStatus(status: string): boolean {
  return (WORLD_PUBLIC_INSTITUTION_STATUSES as readonly string[]).includes(status);
}

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
  if (!raw || !organization || organization.slug !== requestedSlug ||
      !isPublicWorldInstitutionStatus(organization.status)) return null;
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
    representatives: items(raw.representatives).flatMap((value) => {
      const row = object(value);
      return row && nonempty(row.id) && nonempty(row.countryId) &&
        nonempty(row.displayName) && nonempty(row.role) &&
        typeof row.votingAuthority === "boolean"
        ? [{ id: row.id, countryId: row.countryId, displayName: row.displayName,
          role: row.role, votingAuthority: row.votingAuthority,
          endsAt: optionalText(row.endsAt) }]
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
    if (!row || row.public_visibility !== "public" ||
        !isPublicWorldInstitutionStatus(String(row.status ?? ""))) return [];
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
  const publishedStatuses = input.filter === "current"
    ? ["active", "recognized", "suspended"]
    : input.filter === "historical"
      ? ["historical", "dissolved"]
      : [...WORLD_PUBLIC_INSTITUTION_STATUSES];
  let request = (supabase as any).from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status,public_visibility", { count: "exact" })
    .eq("public_visibility", "public")
    .in("status", publishedStatuses)
    .order("official_name", { ascending: true });
  if (term) request = request.or("official_name.ilike.%" + term + "%,short_name.ilike.%" + term + "%");
  const { data, error, count } = await request.range(
    page * WORLD_DIRECTORY_PAGE_SIZE,
    (page + 1) * WORLD_DIRECTORY_PAGE_SIZE - 1,
  );
  if (error) throw new Error("World organizations are temporarily unavailable.");
  // Exact count drives the pager. A missing count must not masquerade as
  // authoritative zero, especially when the backend has returned visible rows.
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("The world directory count could not be verified.");
  }
  const organizations = parseWorldDirectoryRows(data);
  // An invalid/hidden record leaking through an upstream query must not
  // produce an apparently official listing or a misleading server count.
  if (!Array.isArray(data) || organizations.length !== data.length) {
    throw new Error("World organization publication could not be verified.");
  }
  if (organizations.length > WORLD_DIRECTORY_PAGE_SIZE ||
      (organizations.length > 0 && page * WORLD_DIRECTORY_PAGE_SIZE + organizations.length > count) ||
      (page === 0 && organizations.length === 0 && count > 0)) {
    throw new Error("World directory page count could not be verified.");
  }
  return { organizations, total: count };
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
    .in("status", [...WORLD_PUBLIC_INSTITUTION_STATUSES])
    .order("short_name", { ascending: true });
  if (error) throw new Error("World institutions are temporarily unavailable.");
  // Guard against an upstream/RLS regression returning a pre-recognition row
  // despite the explicitly scoped publication query.
  return parseWorldDirectoryRows(data).filter((item) =>
    (item.slug === "guard" || item.slug === "unity") &&
    isPublicWorldInstitutionStatus(item.status));
}

export async function fetchWorldProjection(slug: string): Promise<WorldProjection | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await (supabase as any).rpc("world_organization_projection_v1", {
    p_slug: slug,
  });
  if (error) throw new Error("This organization cannot be loaded right now.");
  return parseWorldProjection(data, slug);
}
