/**
 * Read-only public Terra Solaris world models.
 * TG2 owns organizational truth. The client can shape and filter the
 * publication-safe projection but never decide whether a private row is public.
 */
export const WORLD_DIRECTORY_PAGE_SIZE = 12;
export const WORLD_MEMBERS_PAGE_SIZE = 18;
export const WORLD_DIRECTORY_STATUSES = [
  "all", "active", "recognized", "proposed", "suspended", "dissolved", "historical",
] as const;
export type WorldDirectoryStatus = typeof WORLD_DIRECTORY_STATUSES[number];

export type WorldOrganizationSummary = {
  id: string;
  slug: string;
  officialName: string;
  shortName: string;
  type: string;
  description: string | null;
  emblemUrl: string | null;
  bannerUrl: string | null;
  status: string;
  revision: number;
};
export type WorldDirectory = {
  organizations: WorldOrganizationSummary[];
  total: number;
  page: number;
};
export type WorldMembership = {
  id: string;
  countryId: string;
  membershipType: string;
  status: string;
  joinedAt: string;
  endedAt: string | null;
};
export type WorldRepresentation = {
  id: string;
  countryId: string;
  displayName: string;
  role: string;
  endsAt: string | null;
};
export type WorldOffice = {
  id: string;
  slug: string;
  title: string;
  successionPolicy: string | null;
  currentTerm: null | {
    id: string;
    holderDisplayName: string;
    representedCountryId: string | null;
    startEditionId: string | null;
    endEditionId: string | null;
    termKind: string;
  };
};
export type WorldOrgan = { id: string; slug: string; name: string; type: string };
export type WorldCountryIdentity = {
  id: string;
  name: string;
  code: string;
  flagImage: string | null;
};
export type WorldOrganizationDetail = {
  organization: WorldOrganizationSummary;
  organs: WorldOrgan[];
  memberships: WorldMembership[];
  representatives: WorldRepresentation[];
  offices: WorldOffice[];
  countries: WorldCountryIdentity[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Terra Solaris " + label);
  }
  return value as Record<string, unknown>;
}
function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid Terra Solaris " + label);
  }
  return value.trim();
}
function optional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function entries(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid Terra Solaris " + label);
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid Terra Solaris revision");
  }
  return value;
}
/** Only allow image URLs, never active or opaque schemes in the DOM. */
export function worldImageUrl(value: unknown): string | null {
  const url = optional(value);
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
export function parseWorldOrganization(value: unknown): WorldOrganizationSummary {
  const row = record(value, "organization");
  const slug = required(row.slug, "organization slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid Terra Solaris organization slug");
  }
  return {
    id: required(row.id, "organization id"),
    slug,
    officialName: required(row.officialName ?? row.official_name, "organization name"),
    shortName: required(row.shortName ?? row.short_name, "organization short name"),
    type: required(row.type, "organization type"),
    description: optional(row.description),
    emblemUrl: worldImageUrl(row.emblemUrl ?? row.emblem_url),
    bannerUrl: worldImageUrl(row.bannerUrl ?? row.banner_url),
    status: required(row.status, "organization status"),
    revision: revision(row.revision),
  };
}
export function parseWorldDirectory(raw: unknown, count: unknown, page: number): WorldDirectory {
  if (!Number.isSafeInteger(count) || (count as number) < 0) {
    throw new Error("Invalid Terra Solaris directory count");
  }
  return {
    organizations: entries(raw, "organization directory").map(parseWorldOrganization),
    total: count as number,
    page,
  };
}
export function parseWorldOrganizationDetail(raw: unknown): WorldOrganizationDetail | null {
  if (raw === null) return null;
  const projection = record(raw, "organization projection");
  const organization = parseWorldOrganization(projection.organization);
  return {
    organization,
    organs: entries(projection.organs, "organs").map((value) => {
      const row = record(value, "organ");
      return {
        id: required(row.id, "organ id"),
        slug: required(row.slug, "organ slug"),
        name: required(row.name, "organ name"),
        type: required(row.type, "organ type"),
      };
    }),
    memberships: entries(projection.memberships, "memberships").map((value) => {
      const row = record(value, "membership");
      return {
        id: required(row.id, "membership id"),
        countryId: required(row.countryId, "member country"),
        membershipType: required(row.membershipType, "membership type"),
        status: required(row.status, "membership status"),
        joinedAt: required(row.joinedAt, "membership date"),
        endedAt: optional(row.endedAt),
      };
    }),
    representatives: entries(projection.representatives, "representatives").map((value) => {
      const row = record(value, "representative");
      return {
        id: required(row.id, "representation id"),
        countryId: required(row.countryId, "represented country"),
        displayName: required(row.displayName, "representative name"),
        role: required(row.role, "representative role"),
        endsAt: optional(row.endsAt),
      };
    }),
    offices: entries(projection.offices, "offices").map((value) => {
      const row = record(value, "office");
      const term = row.currentTerm == null ? null : record(row.currentTerm, "office term");
      return {
        id: required(row.id, "office id"),
        slug: required(row.slug, "office slug"),
        title: required(row.title, "office title"),
        successionPolicy: optional(row.successionPolicy),
        currentTerm: term
          ? {
              id: required(term.id, "term id"),
              holderDisplayName: required(term.holderDisplayName, "officeholder"),
              representedCountryId: optional(term.representedCountryId),
              startEditionId: optional(term.startEditionId),
              endEditionId: optional(term.endEditionId),
              termKind: required(term.termKind, "term kind"),
            }
          : null,
      };
    }),
    countries: [],
  };
}
export function parseWorldCountries(raw: unknown): WorldCountryIdentity[] {
  return entries(raw, "countries").map((value) => {
    const row = record(value, "country");
    return {
      id: required(row.id, "country id"),
      name: required(row.name, "country name"),
      code: required(row.short_code, "country code"),
      flagImage: worldImageUrl(row.flag_image),
    };
  });
}
/** Sanitization only protects the PostgREST filter grammar, never publication. */
export function normalizeWorldDirectorySearch(value: string): string {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
export function currentWorldMemberships(detail: WorldOrganizationDetail): WorldMembership[] {
  return detail.memberships.filter((member) =>
    member.endedAt === null &&
    ["member", "observer", "associate", "suspended"].includes(member.status)
  );
}
export function currentWorldRepresentatives(detail: WorldOrganizationDetail): WorldRepresentation[] {
  return detail.representatives.filter((person) => person.endsAt === null);
}
