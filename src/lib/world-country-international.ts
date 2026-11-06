/**
 * Terra Solaris TG3: public country International read models.
 *
 * Current country identity belongs to public.countries. Institutional membership
 * belongs to world_organization_memberships and is visible only through its
 * TG2 organization-scoped RLS policy. No country owner, HoD, capability,
 * representation or private organization is inferred here.
 */
/**
 * Publication-safe React Query snapshot. Cached successful pages are not
 * current authority while a mount-time or background verification is pending.
 */
export function verifiedWorldQueryData<T>(query: {
  isSuccess: boolean;
  isFetchedAfterMount: boolean;
  isFetching: boolean;
  data: T | undefined;
}): T | undefined {
  return query.isSuccess && query.isFetchedAfterMount && !query.isFetching
    ? query.data
    : undefined;
}

export const WORLD_COUNTRY_PAGE_SIZE = 24;
export const WORLD_AFFILIATION_PAGE_SIZE = 12;

/** Refuse ambiguous publication state instead of accidentally mounting a route. */
export function parseWorldPublicRollout(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid World publication flag");
  return value;
}

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
  joinedAt: string;
  endedAt: string | null;
};

// A proposed organization is not yet an official publicly recognized institution.
export const WORLD_RECOGNIZED_INSTITUTION_STATUSES = [
  "recognized", "active", "suspended", "historical", "dissolved",
] as const;
const RECOGNIZED_INSTITUTION_STATES = new Set<string>(WORLD_RECOGNIZED_INSTITUTION_STATUSES);

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

/** A membership date must be an actual, finite timestamp from TG2. */
function validMembershipTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    return false;
  }
  // Date.parse normalizes impossible days such as February 30. Check the
  // original calendar date separately before trusting the timestamp.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay && Number.isFinite(Date.parse(value));
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

/**
 * A URL-selected country must resolve to its exact canonical code. Do not
 * accept a mismatched row if a cached or otherwise malformed API response is
 * returned for a different country.
 */
export function parseWorldCountryIdentity(
  value: unknown,
  expectedCode: string,
): WorldPublicCountry | null {
  if (!validWorldCountryCode(expectedCode)) {
    throw new Error("Invalid requested country code");
  }
  if (value == null) return null;
  const parsed = parseWorldPublicCountries([value])[0];
  if (parsed.code.toUpperCase() !== expectedCode.toUpperCase()) {
    throw new Error("Country identity does not match requested code");
  }
  return parsed;
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
    const joinedAt = requiredString(data.joined_at, "membership start");
    if (!validMembershipTime(joinedAt) || (endedAt !== null && !validMembershipTime(endedAt))) {
      throw new Error("Invalid institutional membership dates");
    }
    if (endedAt !== null && Date.parse(endedAt) < Date.parse(joinedAt)) {
      throw new Error("Institutional membership ends before it begins");
    }
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
      joinedAt,
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
    const status = requiredString(data.status, "institution status");
    if (!RECOGNIZED_INSTITUTION_STATES.has(status)) {
      throw new Error("Unrecognized institution cannot appear in the public International view");
    }
    ids.add(id);
    return {
      id,
      slug,
      name: requiredString(data.short_name, "institution name"),
      officialName: requiredString(data.official_name, "institution official name"),
      status,
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
