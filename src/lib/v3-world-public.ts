/**
 * TG3 read-only public Terra Solaris presentation contract.
 * Authoritative scope and publication are enforced by #1888's RLS/RPC.
 * This adapter validates their output; it never creates official world state.
 */
export type WorldOrganization = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string | null;
  type: string;
  status: "proposed" | "recognized" | "active" | "suspended" | "dissolved" | "historical";
};

export type WorldMembership = {
  id: string;
  countryId: string;
  membershipType: "member" | "observer" | "associate";
  status: "member" | "observer" | "associate" | "suspended" | "withdrawn" | "expelled" | "former";
  joinedAt: string;
  endedAt: string | null;
};

export type WorldOffice = {
  id: string;
  title: string;
  currentTerm: {
    holderDisplayName: string;
    startsAt: string;
    termKind: string;
    representedCountryId: string | null;
  } | null;
};

export type WorldOrgan = { id: string; name: string; status: string };

export type WorldOrganizationDetail = {
  organization: WorldOrganization;
  organs: WorldOrgan[];
  memberships: WorldMembership[];
  offices: WorldOffice[];
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(["proposed", "recognized", "active", "suspended", "dissolved", "historical"]);
const MEMBER_TYPES = new Set(["member", "observer", "associate"]);
const MEMBER_STATES = new Set(["member", "observer", "associate", "suspended", "withdrawn", "expelled", "former"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public Terra Solaris projection");
  }
  return value as Record<string, unknown>;
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw new Error("Invalid public Terra Solaris field");
  }
  return value.trim();
}

function nullable(value: unknown): string | null {
  return value == null ? null : required(value);
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid public Terra Solaris collection");
  return value;
}

function organization(input: unknown, directory = false): WorldOrganization {
  const row = record(input);
  const slug = required(row.slug);
  const status = required(directory ? row.status : row.status);
  if (!SLUG.test(slug) || !STATUSES.has(status)) throw new Error("Invalid institution identity");
  return {
    id: required(row.id),
    slug,
    name: required(directory ? row.official_name : row.officialName),
    shortName: required(directory ? row.short_name : row.shortName),
    description: nullable(row.description),
    type: required(row.type),
    status: status as WorldOrganization["status"],
  };
}

export function normalizeWorldSearch(search: string): string {
  // PostgREST or() filter metacharacters must never reach the filter grammar.
  return search.normalize("NFKC")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parseWorldDirectory(input: unknown): WorldOrganization[] {
  const seen = new Set<string>();
  return list(input).map((raw) => {
    const item = organization(raw, true);
    if (seen.has(item.slug)) throw new Error("Duplicate public institution");
    seen.add(item.slug);
    return item;
  });
}

export function parseWorldOrganization(input: unknown, expectedSlug: string): WorldOrganizationDetail | null {
  if (input == null) return null; // RPC explicitly returns null for nonpublic or unknown slugs.
  if (!SLUG.test(expectedSlug)) throw new Error("Invalid institution route");
  const row = record(input);
  const org = organization(row.organization);
  if (org.slug !== expectedSlug) throw new Error("Institution projection scope mismatch");
  const organs = list(row.organs).map((raw): WorldOrgan => {
    const value = record(raw);
    return { id: required(value.id), name: required(value.name), status: required(value.status) };
  });
  const memberships = list(row.memberships).map((raw): WorldMembership => {
    const value = record(raw);
    const membershipType = required(value.membershipType);
    const status = required(value.status);
    if (!MEMBER_TYPES.has(membershipType) || !MEMBER_STATES.has(status)) {
      throw new Error("Invalid public membership status");
    }
    return {
      id: required(value.id),
      countryId: required(value.countryId),
      membershipType: membershipType as WorldMembership["membershipType"],
      status: status as WorldMembership["status"],
      joinedAt: required(value.joinedAt),
      endedAt: nullable(value.endedAt),
    };
  });
  const offices = list(row.offices).map((raw): WorldOffice => {
    const value = record(raw);
    const term = value.currentTerm == null ? null : record(value.currentTerm);
    return {
      id: required(value.id),
      title: required(value.title),
      currentTerm: term ? {
        holderDisplayName: required(term.holderDisplayName),
        startsAt: required(term.startsAt),
        termKind: required(term.termKind),
        representedCountryId: nullable(term.representedCountryId),
      } : null,
    };
  });
  return { organization: org, organs, memberships, offices };
}

export function currentWorldMembers(memberships: readonly WorldMembership[]): WorldMembership[] {
  return memberships.filter((item) =>
    item.endedAt === null &&
    (item.status === "member" || item.status === "observer" || item.status === "associate" || item.status === "suspended")
  ).sort((a, b) => a.countryId.localeCompare(b.countryId));
}

export function pageWorldMembers(memberships: readonly WorldMembership[], page: number, size = 24) {
  const pages = Math.max(1, Math.ceil(memberships.length / size));
  const safePage = Math.min(Math.max(0, Math.trunc(Number.isFinite(page) ? page : 0)), pages - 1);
  return {
    page: safePage,
    pages,
    total: memberships.length,
    items: memberships.slice(safePage * size, (safePage + 1) * size),
  };
}
