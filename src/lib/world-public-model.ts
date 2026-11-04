/** Public-only presentation models for TG3. No authorization or canonical writes live here. */
export const WORLD_DIRECTORY_PAGE_SIZE = 24;
export const WORLD_DIRECTORY_SEARCH_LIMIT = 64;

export const WORLD_ORGANIZATION_STATUSES = [
  "proposed",
  "recognized",
  "active",
  "suspended",
  "dissolved",
  "historical",
] as const;

export type WorldOrganizationStatus = (typeof WORLD_ORGANIZATION_STATUSES)[number];
export type WorldOrganizationFilter = "all" | WorldOrganizationStatus;

export type WorldOrganizationSummary = {
  id: string;
  slug: string;
  officialName: string;
  shortName: string;
  type: string;
  description: string | null;
  status: WorldOrganizationStatus;
};

export type WorldOrgan = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  type: string;
  status: string;
};

export type WorldMembership = {
  id: string;
  countryId: string;
  membershipType: string;
  status: "member" | "observer" | "associate" | "suspended" | "withdrawn" | "expelled" | "former";
  joinedAt: string | null;
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
  slug: string;
  title: string;
  currentHolder: string | null;
  representedCountryId: string | null;
};

export type WorldOrganizationDetail = {
  organization: WorldOrganizationSummary;
  organs: WorldOrgan[];
  memberships: WorldMembership[];
  representatives: WorldRepresentative[];
  offices: WorldOffice[];
};

export type WorldCountryIdentity = {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public world data: " + label);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public world data: " + label);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredList<T>(
  value: unknown,
  label: string,
  parse: (item: unknown) => T,
): T[] {
  if (!Array.isArray(value)) throw new Error("Invalid public world data: " + label);
  return value.map(parse);
}

function validStatus(value: unknown): WorldOrganizationStatus {
  if (
    typeof value !== "string" ||
    !(WORLD_ORGANIZATION_STATUSES as readonly string[]).includes(value)
  ) {
    throw new Error("Invalid public world data: organization status");
  }
  return value as WorldOrganizationStatus;
}

function validSlug(value: unknown): string {
  const slug = requiredText(value, "organization slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid public world data: organization slug");
  }
  return slug;
}

/** Strip everything except public display fields, even if a future RPC adds private keys. */
export function parseWorldOrganizationSummary(value: unknown): WorldOrganizationSummary {
  const row = record(value, "organization");
  if (row.public_visibility !== undefined && row.public_visibility !== "public") {
    throw new Error("Private organization cannot enter public directory");
  }
  return {
    id: requiredText(row.id, "organization id"),
    slug: validSlug(row.slug),
    officialName: requiredText(row.official_name ?? row.officialName, "official name"),
    shortName: requiredText(row.short_name ?? row.shortName, "short name"),
    type: requiredText(row.type, "organization type"),
    description: optionalText(row.description),
    status: validStatus(row.status),
  };
}

export function parseWorldOrganizationDirectory(value: unknown): WorldOrganizationSummary[] {
  return requiredList(value, "organization directory", parseWorldOrganizationSummary);
}

/** The published TG2 RPC owns visibility and assembly of this read-only snapshot. */
export function parseWorldOrganizationDetail(value: unknown): WorldOrganizationDetail | null {
  if (value === null) return null;
  const result = record(value, "organization projection");
  const organization = parseWorldOrganizationSummary(result.organization);
  const organs = requiredList(result.organs, "organs", (raw): WorldOrgan => {
    const item = record(raw, "organ");
    return {
      id: requiredText(item.id, "organ id"),
      slug: validSlug(item.slug),
      name: requiredText(item.name, "organ name"),
      shortName: optionalText(item.shortName),
      type: requiredText(item.type, "organ type"),
      status: requiredText(item.status, "organ status"),
    };
  });
  const memberships = requiredList(result.memberships, "memberships", (raw): WorldMembership => {
    const item = record(raw, "membership");
    const status = requiredText(item.status, "membership status");
    if (!["member", "observer", "associate", "suspended", "withdrawn", "expelled", "former"].includes(status)) {
      throw new Error("Invalid public world data: membership status");
    }
    return {
      id: requiredText(item.id, "membership id"),
      countryId: requiredText(item.countryId, "membership country"),
      membershipType: requiredText(item.membershipType, "membership type"),
      status: status as WorldMembership["status"],
      joinedAt: optionalText(item.joinedAt),
      endedAt: optionalText(item.endedAt),
    };
  });
  const representatives = requiredList(result.representatives, "representatives", (raw): WorldRepresentative => {
    const item = record(raw, "representative");
    if (typeof item.votingAuthority !== "boolean") {
      throw new Error("Invalid public world data: voting authority");
    }
    return {
      id: requiredText(item.id, "representative id"),
      countryId: requiredText(item.countryId, "represented country"),
      displayName: requiredText(item.displayName, "representative name"),
      role: requiredText(item.role, "representative role"),
      votingAuthority: item.votingAuthority,
      endsAt: optionalText(item.endsAt),
    };
  });
  const offices = requiredList(result.offices, "offices", (raw): WorldOffice => {
    const item = record(raw, "office");
    const term = item.currentTerm === null || item.currentTerm === undefined
      ? null : record(item.currentTerm, "office term");
    return {
      id: requiredText(item.id, "office id"),
      slug: validSlug(item.slug),
      title: requiredText(item.title, "office title"),
      currentHolder: term ? optionalText(term.holderDisplayName) : null,
      representedCountryId: term ? optionalText(term.representedCountryId) : null,
    };
  });
  return { organization, organs, memberships, representatives, offices };
}

/**
 * The query is embedded in a PostgREST OR expression only after removing all
 * expression syntax and wildcard characters. This does NOT authorize access.
 */
export function sanitizeWorldDirectorySearch(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N} -]/gu, "").replace(/\s+/g, " ").slice(0, WORLD_DIRECTORY_SEARCH_LIMIT).trim();
}

export function worldSearchExpression(sanitized: string): string | null {
  if (!sanitized) return null;
  if (sanitizeWorldDirectorySearch(sanitized) !== sanitized) {
    throw new Error("World directory search must be sanitized");
  }
  return "official_name.ilike.%" + sanitized + "%,short_name.ilike.%" + sanitized + "%";
}

export function activeWorldMemberships(rows: WorldMembership[]): WorldMembership[] {
  return rows.filter((row) => row.endedAt === null && (
    row.status === "member" || row.status === "observer" ||
    row.status === "associate" || row.status === "suspended"
  ));
}

export function currentWorldRepresentatives(rows: WorldRepresentative[]): WorldRepresentative[] {
  return rows.filter((row) => row.endsAt === null);
}

export function worldStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}
