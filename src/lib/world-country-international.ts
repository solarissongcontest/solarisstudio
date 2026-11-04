/**
 * Terra Solaris TG3: public country International read models.
 *
 * Current country identity belongs to public.countries. Institutional membership
 * belongs to world_organization_memberships and is visible only through its
 * TG2 organization-scoped RLS policy. No country owner, HoD, capability,
 * representation or private organization is inferred here.
 */
export const WORLD_COUNTRY_PAGE_SIZE = 24;
export const WORLD_AFFILIATION_PAGE_SIZE = 12;

export type WorldPublicCountry = {
  id: string;
  code: string;
  name: string;
  region: string;
  flagImage: string | null;
  accentColor: string;
};

export type WorldPublicInstitution = {
  id: string;
  slug: string;
  name: string;
  officialName: string;
  status: string;
};

export type WorldCountryAffiliation = {
  id: string;
  countryId: string;
  organizationId: string;
  membershipType: "member" | "observer" | "associate";
  status: "member" | "observer" | "associate" | "suspended" | "withdrawn" | "expelled" | "former";
  joinedEditionId: string | null;
  endedEditionId: string | null;
  endedAt: string | null;
};

const CURRENT_STATES = new Set(["member", "observer", "associate", "suspended"]);
const HISTORICAL_STATES = new Set(["withdrawn", "expelled", "former"]);
const MEMBER_TYPES = new Set(["member", "observer", "associate"]);

function row(value: unknown, type: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public " + type);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, type: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public " + type);
  }
  return value.trim();
}

function optionalString(value: unknown, type: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid public " + type);
  return value;
}

function records<T>(value: unknown, type: string, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("Invalid public " + type);
  return value.map(parse);
}

export function validWorldCountryCode(raw: string): boolean {
  return raw.length >= 2 && raw.length <= 20 &&
    /^[\p{L}\p{N}-]+$/u.test(raw);
}

/** Produce a bounded literal, not user-supplied PostgREST filter syntax. */
export function normalizeWorldCountrySearch(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 64)
    .replace(/[^\p{L}\p{N} -]/gu, "").trim();
}

export function worldCountrySearchFilter(raw: string): string | null {
  const text = normalizeWorldCountrySearch(raw);
  return text ? "name.ilike.%" + text + "%,short_code.ilike.%" + text + "%" : null;
}

export function parseWorldPublicCountries(value: unknown): WorldPublicCountry[] {
  const ids = new Set<string>();
  const codes = new Set<string>();
  return records(value, "country directory", (item) => {
    const data = row(item, "country identity");
    const id = requiredString(data.id, "country ID");
    const code = requiredString(data.short_code, "country code");
    if (!validWorldCountryCode(code)) throw new Error("Invalid public country code");
    if (ids.has(id) || codes.has(code.toUpperCase())) {
      throw new Error("Duplicate public country identity");
    }
    ids.add(id);
    codes.add(code.toUpperCase());
    return {
      id,
      code,
      name: requiredString(data.name, "country name"),
      region: requiredString(data.region, "country region"),
      flagImage: optionalString(data.flag_image, "country flag"),
      accentColor:
        typeof data.accent_color === "string" && /^#[a-f0-9]{6}$/i.test(data.accent_color)
          ? data.accent_color : "#40628a",
    };
  });
}

export function parseWorldCountryAffiliations(
  value: unknown,
  expectedCountryId: string,
  phase: "current" | "historical",
): WorldCountryAffiliation[] {
  if (!expectedCountryId) throw new Error("Missing expected country identity");
  const ids = new Set<string>();
  return records(value, "country affiliations", (item) => {
    const data = row(item, "country affiliation");
    const id = requiredString(data.id, "affiliation ID");
    const countryId = requiredString(data.country_id, "affiliation country");
    const organizationId = requiredString(data.organization_id, "affiliation organization");
    const membershipType = requiredString(data.membership_type, "membership type");
    const status = requiredString(data.status, "membership status");
    const endedAt = optionalString(data.ended_at, "membership end");
    if (countryId !== expectedCountryId) throw new Error("Cross-country affiliation response");
    if (ids.has(id)) throw new Error("Duplicate institutional affiliation");
    ids.add(id);
    if (!MEMBER_TYPES.has(membershipType)) throw new Error("Unknown institutional membership type");
    if (!CURRENT_STATES.has(status) && !HISTORICAL_STATES.has(status)) {
      throw new Error("Unknown institutional membership state");
    }
    if (phase === "current" && (!CURRENT_STATES.has(status) || endedAt !== null)) {
      throw new Error("Non-current membership in current affiliations");
    }
    if (phase === "historical" && (!HISTORICAL_STATES.has(status) || endedAt === null)) {
      throw new Error("Non-historical membership in past affiliations");
    }
    return {
      id,
      countryId,
      organizationId,
      membershipType: membershipType as WorldCountryAffiliation["membershipType"],
      status: status as WorldCountryAffiliation["status"],
      joinedEditionId: optionalString(data.joined_edition_id, "joined edition"),
      endedEditionId: optionalString(data.ended_edition_id, "ended edition"),
      endedAt,
    };
  });
}

export function parseWorldPublicInstitutions(
  value: unknown,
  allowedIds: readonly string[],
): WorldPublicInstitution[] {
  const allowed = new Set(allowedIds);
  const ids = new Set<string>();
  return records(value, "public organizations", (item) => {
    const data = row(item, "institution");
    const id = requiredString(data.id, "institution ID");
    const slug = requiredString(data.slug, "institution slug");
    if (data.public_visibility !== "public") {
      throw new Error("Non-public institution in country International projection");
    }
    if (!allowed.has(id) || ids.has(id)) {
      throw new Error("Out-of-scope or duplicate institution in International projection");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Invalid institutional slug");
    }
    ids.add(id);
    return {
      id,
      slug,
      name: requiredString(data.short_name, "institution name"),
      officialName: requiredString(data.official_name, "institution official name"),
      status: requiredString(data.status, "institution status"),
    };
  });
}

/**
 * Do not render an RLS-raced/missing institution as a public affiliation.
 * The public institution lookup is the second independent publication gate.
 */
export function visibleWorldCountryAffiliations(
  affiliations: readonly WorldCountryAffiliation[],
  organizations: readonly WorldPublicInstitution[],
) {
  const byId = new Map(organizations.map((organization) => [organization.id, organization] as const));
  return affiliations.flatMap((affiliation) => {
    const organization = byId.get(affiliation.organizationId);
    return organization ? [{ affiliation, organization }] : [];
  });
}

export function verifiedWorldCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid public World count");
  }
  return value;
}
