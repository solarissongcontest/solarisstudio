/**
 * Public Terra Solaris institutional membership chronicle.
 *
 * TG2's world_organization_memberships is the only membership authority.
 * This projection is deliberately read-only and excludes institutions that
 * have not been made public by the TG2 RLS policy.
 */
export const WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE = 16;
export const WORLD_MEMBERSHIP_CHRONICLE_ORGANIZATION_LIMIT = 100;

export type WorldMembershipChronicleScope = "all" | "current" | "ended";

export type WorldChronicleInstitution = {
  id: string;
  slug: string;
  shortName: string;
};
export type WorldChronicleMembership = {
  id: string;
  organization: WorldChronicleInstitution;
  country: {
    id: string;
    code: string;
    name: string;
    flagImage: string | null;
  };
  type: string;
  status: string;
  joinedAt: string;
  endedAt: string | null;
};
export type WorldMembershipChronicle = {
  records: WorldChronicleMembership[];
  total: number;
  page: number;
  scope: WorldMembershipChronicleScope;
};

const CURRENT = new Set(["member", "observer", "associate", "suspended"]);
const ENDED = new Set(["withdrawn", "expelled", "former"]);

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
function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid Terra Solaris " + label);
  return value;
}
function image(value: unknown): string | null {
  const candidate = optional(value);
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\")) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}
function asDate(value: unknown, label: string): string {
  const text = required(value, label);
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch)) throw new Error("Invalid Terra Solaris " + label);
  return text;
}

export function normalizeWorldChronicleCountryCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (code && !/^[A-Z0-9_-]{1,16}$/.test(code)) {
    throw new Error("Invalid Terra Solaris country filter");
  }
  return code;
}

export function normalizeWorldChronicleOrganizationSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid Terra Solaris organization filter");
  }
  return slug;
}

export function parseWorldChronicleInstitutions(raw: unknown): WorldChronicleInstitution[] {
  const seen = new Set<string>();
  return list(raw, "public institutions").map((value) => {
    const row = record(value, "public institution");
    const institution = {
      id: required(row.id, "institution id"),
      slug: normalizeWorldChronicleOrganizationSlug(required(row.slug, "institution slug")),
      shortName: required(row.short_name, "institution name"),
    };
    if (seen.has(institution.id)) throw new Error("Duplicate public institution");
    seen.add(institution.id);
    return institution;
  }).sort((a, b) => a.shortName.localeCompare(b.shortName));
}

export function parseWorldMembershipChronicle(input: {
  rows: unknown;
  organizations: unknown;
  countries: unknown;
  count: unknown;
  page: number;
  scope: WorldMembershipChronicleScope;
}): WorldMembershipChronicle {
  if (!Number.isSafeInteger(input.count) || (input.count as number) < 0) {
    throw new Error("Institutional membership history count unavailable");
  }
  if (!Number.isSafeInteger(input.page) || input.page < 0) {
    throw new Error("Invalid institutional membership history page");
  }
  const publicInstitutions = new Map(
    parseWorldChronicleInstitutions(input.organizations).map((institution) => [institution.id, institution])
  );
  const countries = new Map<string, {
    id: string;
    code: string;
    name: string;
    flagImage: string | null;
  }>();

  for (const item of list(input.countries, "public countries")) {
    const row = record(item, "country");
    const id = required(row.id, "country id");
    const code = normalizeWorldChronicleCountryCode(required(row.short_code, "country code"));
    const country = { id, code, name: required(row.name, "country name"), flagImage: image(row.flag_image) };
    if (countries.has(id)) throw new Error("Duplicate country in membership projection");
    countries.set(id, country);
  }

  const seen = new Set<string>();
  const records: WorldChronicleMembership[] = [];

  for (const item of list(input.rows, "memberships")) {
    const row = record(item, "membership");
    const id = required(row.id, "membership id");
    if (seen.has(id)) throw new Error("Duplicate institutional membership");
    seen.add(id);
    const organizationId = required(row.organization_id, "membership institution");
    const countryId = required(row.country_id, "membership country");
    // Never reveal a membership to an organization that cannot be resolved
    // as published, even if an upstream projection becomes overpermissive.
    const organization = publicInstitutions.get(organizationId);
    if (!organization) continue;
    const country = countries.get(countryId);
    if (!country) throw new Error("Published membership has no verifiable country identity");

    const status = required(row.status, "membership status");
    const joinedAt = asDate(row.joined_at, "membership start");
    const endedAt = optional(row.ended_at);
    if (endedAt) {
      asDate(endedAt, "membership end");
      if (!ENDED.has(status) || Date.parse(endedAt) < Date.parse(joinedAt)) {
        throw new Error("Inconsistent ended institutional membership");
      }
    } else if (!CURRENT.has(status)) {
      throw new Error("Inconsistent current institutional membership");
    }

    const membership: WorldChronicleMembership = {
      id, organization, country,
      type: required(row.membership_type, "membership type"),
      status, joinedAt, endedAt,
    };
    if (input.scope === "current" && membership.endedAt !== null) {
      throw new Error("Ended membership included in current scope");
    }
    if (input.scope === "ended" && membership.endedAt === null) {
      throw new Error("Active membership included in ended scope");
    }
    records.push(membership);
  }
  records.sort((a, b) =>
    b.joinedAt.localeCompare(a.joinedAt) || a.id.localeCompare(b.id)
  );
  return {
    records,
    total: input.count as number,
    page: input.page,
    scope: input.scope,
  };
}
