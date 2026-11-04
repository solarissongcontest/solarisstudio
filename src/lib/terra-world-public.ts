// Terra Solaris TG2 public projection presentation contract.
// Never infer official institutional membership, offices or leadership from lore.
export const WORLD_ORG_PAGE_SIZE = 24;
export const WORLD_ORG_STATUSES = [
  'active', 'recognized', 'proposed', 'suspended', 'dissolved', 'historical',
] as const;

export type WorldOrgStatus = (typeof WORLD_ORG_STATUSES)[number];
export type WorldOrgFilter = WorldOrgStatus | 'all';

export type PublicWorldOrganization = {
  id: string;
  slug: string;
  officialName: string;
  shortName: string;
  description: string | null;
  type: string;
  status: WorldOrgStatus;
  emblemUrl: string | null;
  bannerUrl: string | null;
  revision: number;
};

export type PublicWorldOrgan = {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  status: string;
};

export type PublicWorldMembership = {
  id: string;
  countryId: string;
  status: string;
  membershipType: string;
  joinedAt: string | null;
  endedAt: string | null;
};

export type PublicWorldRepresentative = {
  id: string;
  countryId: string;
  displayName: string;
  role: string;
  endsAt: string | null;
};

export type PublicWorldOffice = {
  id: string;
  title: string;
  termLengthEditions: number | null;
  currentHolder: string | null;
  representedCountryId: string | null;
};

export type PublicWorldProfile = {
  organization: PublicWorldOrganization;
  organs: PublicWorldOrgan[];
  memberships: PublicWorldMembership[];
  representatives: PublicWorldRepresentative[];
  offices: PublicWorldOffice[];
};

type Row = Record<string, unknown>;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTIVE_MEMBERSHIPS = new Set(['member', 'observer', 'associate', 'suspended']);

function record(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Row : null;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | null {
  return string(value) || null;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(record).filter((row): row is Row => row !== null) : [];
}

export function safeWorldAssetUrl(value: unknown): string | null {
  const raw = string(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeWorldOrgSearch(value: string): string {
  // PostgREST .or() has its own filter grammar. Never interpolate punctuation
  // from user input into that grammar.
  return value.normalize('NFKC')
    .replace(/[^\p{L}\p{N} -]/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 64);
}

export function parseWorldOrganization(value: unknown): PublicWorldOrganization | null {
  const row = record(value);
  if (!row) return null;
  const visibility = string(row.public_visibility ?? row.publicVisibility ?? 'public');
  if (visibility !== 'public') return null;
  const id = string(row.id);
  const slug = string(row.slug);
  const officialName = string(row.official_name ?? row.officialName);
  const shortName = string(row.short_name ?? row.shortName);
  const status = string(row.status);
  if (!id || !SLUG.test(slug) || !officialName || !shortName ||
      !WORLD_ORG_STATUSES.includes(status as WorldOrgStatus)) return null;
  const revision = Number(row.revision);
  return {
    id, slug, officialName, shortName,
    description: optionalString(row.description),
    type: string(row.type) || 'international_organization',
    status: status as WorldOrgStatus,
    emblemUrl: safeWorldAssetUrl(row.emblem_url ?? row.emblemUrl),
    bannerUrl: safeWorldAssetUrl(row.banner_url ?? row.bannerUrl),
    revision: Number.isSafeInteger(revision) && revision >= 1 ? revision : 1,
  };
}

export function parseWorldOrganizationProfile(value: unknown): PublicWorldProfile | null {
  const root = record(value);
  const organization = parseWorldOrganization(root?.organization);
  if (!root || !organization) return null;
  return {
    organization,
    organs: rows(root.organs).filter((r) => string(r.id) && string(r.name)).map((r) => ({
      id: string(r.id), name: string(r.name), shortName: optionalString(r.shortName),
      type: string(r.type), status: string(r.status),
    })),
    memberships: rows(root.memberships).filter((r) => string(r.id) && string(r.countryId)).map((r) => ({
      id: string(r.id), countryId: string(r.countryId), status: string(r.status),
      membershipType: string(r.membershipType), joinedAt: optionalString(r.joinedAt),
      endedAt: optionalString(r.endedAt),
    })),
    representatives: rows(root.representatives).filter((r) => string(r.id) && string(r.countryId)).map((r) => ({
      id: string(r.id), countryId: string(r.countryId),
      displayName: string(r.displayName), role: string(r.role),
      endsAt: optionalString(r.endsAt),
    })),
    offices: rows(root.offices).filter((r) => string(r.id) && string(r.title)).map((r) => {
      const term = record(r.currentTerm);
      const termLength = Number(r.defaultTermLengthEditions);
      return {
        id: string(r.id), title: string(r.title),
        termLengthEditions: Number.isSafeInteger(termLength) && termLength > 0 ? termLength : null,
        currentHolder: term ? optionalString(term.holderDisplayName) : null,
        representedCountryId: term ? optionalString(term.representedCountryId) : null,
      };
    }),
  };
}

export function currentWorldMemberships(profile: PublicWorldProfile): PublicWorldMembership[] {
  return profile.memberships.filter((membership) =>
    membership.endedAt === null && ACTIVE_MEMBERSHIPS.has(membership.status));
}

export function currentWorldRepresentatives(profile: PublicWorldProfile): PublicWorldRepresentative[] {
  return profile.representatives.filter((representative) => representative.endsAt === null);
}

export function worldOrgStatusLabel(status: WorldOrgStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
