/**
 * Read-only Terra Solaris country International experience.
 *
 * Country identity comes from TG1's public world_country_identity_v1 and
 * membership from TG2's public RLS. The UI has no authority to invent office
 * holders, membership, representative appointments or country controllers.
 */
export const WORLD_COUNTRY_PAGE_SIZE = 18;
export const WORLD_COUNTRY_MAX_MEMBERSHIPS = 250;

export type WorldCountryDirectoryRow = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  flagImage: string | null;
};

export type WorldCountryDirectory = {
  countries: WorldCountryDirectoryRow[];
  total: number;
  page: number;
};

export type WorldCountryIdentity = {
  countryId: string;
  name: string;
  code: string;
  nativeName: string | null;
  controllerName: string | null;
  controlStartedAt: string | null;
  capital: string | null;
  governmentType: string | null;
  leaderName: string | null;
  leaderTitle: string | null;
};

export type WorldCountryMembership = {
  id: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  membershipType: string;
  status: string;
  joinedAt: string;
  endedAt: string | null;
};

export type WorldCountryInternational = {
  country: WorldCountryDirectoryRow;
  identity: WorldCountryIdentity;
  currentMemberships: WorldCountryMembership[];
  formerMemberships: WorldCountryMembership[];
};

const ACTIVE_MEMBERSHIP_STATUSES = new Set(["member", "observer", "associate", "suspended"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Terra Solaris " + label);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid Terra Solaris " + label);
  }
  return value.trim();
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid Terra Solaris " + label);
  return value;
}

/** Do not allow untrusted image schemes to become link or image sources. */
export function worldCountrySafeImage(value: unknown): string | null {
  const path = nullable(value);
  if (!path) return null;
  if (path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")) {
    return path;
  }
  try {
    const parsed = new URL(path);
    return parsed.protocol === "https:" ? path : null;
  } catch {
    return null;
  }
}

export function worldCountryCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,16}$/.test(code)) {
    throw new Error("Invalid Terra Solaris country code");
  }
  return code;
}

/**
 * Search may be user-written, but must never inject PostgREST filter grammar.
 * The resulting term is not an authorization predicate. RLS still applies.
 */
export function worldCountrySearchTerm(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function parseWorldCountry(value: unknown): WorldCountryDirectoryRow {
  const row = object(value, "country");
  return {
    id: string(row.id, "country id"),
    name: string(row.name, "country name"),
    code: worldCountryCode(string(row.short_code, "country code")),
    region: nullable(row.region),
    flagImage: worldCountrySafeImage(row.flag_image),
  };
}

export function parseWorldCountryDirectory(
  value: unknown,
  total: unknown,
  page: number,
): WorldCountryDirectory {
  if (!Number.isSafeInteger(total) || (total as number) < 0) {
    throw new Error("Invalid Terra Solaris country directory count");
  }
  if (!Number.isSafeInteger(page) || page < 0) {
    throw new Error("Invalid Terra Solaris country page");
  }
  return {
    countries: list(value, "countries").map(parseWorldCountry),
    total: total as number,
    page,
  };
}

export function parseWorldCountryIdentity(
  value: unknown,
  expectedCountryId: string,
): WorldCountryIdentity {
  const values = list(value, "world country identity projection");
  if (values.length !== 1) throw new Error("Unresolved Terra Solaris country identity");
  const row = object(values[0], "world country identity");
  const countryId = string(row.country_id, "world country id");
  if (countryId !== expectedCountryId) {
    throw new Error("Terra Solaris country identity mismatch");
  }
  return {
    countryId,
    name: string(row.country_name, "world country name"),
    code: worldCountryCode(string(row.short_code, "world country code")),
    nativeName: nullable(row.native_name),
    controllerName: nullable(row.controller_display_name),
    controlStartedAt: nullable(row.control_started_at),
    capital: nullable(row.capital),
    governmentType: nullable(row.government_type),
    leaderName: nullable(row.leader_name),
    leaderTitle: nullable(row.leader_title),
  };
}

export function parseWorldCountryInternational(
  countryRaw: unknown,
  identityRaw: unknown,
  membershipsRaw: unknown,
  publicOrganizationsRaw: unknown,
): WorldCountryInternational {
  const country = parseWorldCountry(countryRaw);
  const identity = parseWorldCountryIdentity(identityRaw, country.id);
  const organizations = new Map<string, { slug: string; name: string }>();

  for (const entry of list(publicOrganizationsRaw, "public institutions")) {
    const item = object(entry, "public institution");
    const id = string(item.id, "institution id");
    const slug = string(item.slug, "institution slug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Invalid public institution slug");
    }
    if (organizations.has(id)) throw new Error("Duplicate Terra Solaris institution");
    organizations.set(id, {
      slug,
      name: string(item.short_name, "institution name"),
    });
  }

  const memberships: WorldCountryMembership[] = [];
  const seen = new Set<string>();
  for (const entry of list(membershipsRaw, "memberships")) {
    const row = object(entry, "membership");
    if (string(row.country_id, "membership country") !== country.id) {
      throw new Error("Foreign Terra Solaris membership in country projection");
    }
    const id = string(row.id, "membership id");
    if (seen.has(id)) throw new Error("Duplicate Terra Solaris country membership");
    seen.add(id);
    const organizationId = string(row.organization_id, "membership organization");
    const publishedOrganization = organizations.get(organizationId);
    // RLS may permit historical membership rows only when their institution
    // is public. Never surface a missing/private organization as an ID.
    if (!publishedOrganization) continue;
    const status = string(row.status, "membership status");
    memberships.push({
      id,
      organizationId,
      organizationSlug: publishedOrganization.slug,
      organizationName: publishedOrganization.name,
      membershipType: string(row.membership_type, "membership type"),
      status,
      joinedAt: string(row.joined_at, "membership joined at"),
      endedAt: nullable(row.ended_at),
    });
  }

  memberships.sort((a, b) =>
    b.joinedAt.localeCompare(a.joinedAt) || a.organizationName.localeCompare(b.organizationName)
  );

  return {
    country,
    identity,
    currentMemberships: memberships.filter((entry) =>
      entry.endedAt === null && ACTIVE_MEMBERSHIP_STATUSES.has(entry.status)
    ),
    formerMemberships: memberships.filter((entry) =>
      entry.endedAt !== null || !ACTIVE_MEMBERSHIP_STATUSES.has(entry.status)
    ),
  };
}
