/**
 * TG3 public institutional representatives. The SQL projection is the
 * publication and count authority; this decoder only verifies its contract.
 * Neither auth-user IDs nor private proxy/office permission records are used.
 */
export const WORLD_REPRESENTATIVE_PAGE_SIZE = 16;
export const WORLD_REPRESENTATIVE_MAX_PAGE = 100;
export type WorldRepresentativeFilter = "current" | "past" | "all";

export type WorldRepresentative = {
  id: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  countryFlagUrl: string | null;
  displayName: string;
  role: string;
  votingAuthority: boolean;
  startsAt: string;
  endsAt: string | null;
  revision: number;
};

export type WorldRepresentativeRoster = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  filter: WorldRepresentativeFilter;
  search: string;
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  rows: WorldRepresentative[];
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validWorldOrganizationSlug(value: string) {
  return SLUG_PATTERN.test(value) && value.length <= 120;
}

export function normalizedWorldRepresentativeSearch(value: string) {
  // Parameterized SQL substring matching, never a raw PostgREST .or expression.
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 64);
}

function object(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function required(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function utcDate(value: unknown): string | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ||
      !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function publicWorldRepresentativeFlag(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !/[\s<>"\\]/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.username === "" && url.password === "") return value;
  } catch {
    // A malformed image URL is never promoted to browser markup.
  }
  return null;
}

export function parseWorldRepresentativeRoster(
  input: unknown,
  expected: { slug: string; filter: WorldRepresentativeFilter; search: string; page: number },
): WorldRepresentativeRoster | null {
  if (input === null) return null; // Unknown / nonpublic organization: same response.
  const data = object(input);
  const organizationId = required(data?.organizationId);
  const organizationSlug = required(data?.organizationSlug);
  const organizationName = required(data?.organizationName);
  const offset = expected.page * WORLD_REPRESENTATIVE_PAGE_SIZE;
  const normalizedSearch = normalizedWorldRepresentativeSearch(expected.search).toLowerCase();

  if (!data || !organizationId || !organizationSlug || !organizationName ||
      !validWorldOrganizationSlug(expected.slug) ||
      organizationSlug !== expected.slug || data.schemaVersion !== 1 ||
      data.filter !== expected.filter || data.search !== normalizedSearch ||
      data.offset !== offset || data.limit !== WORLD_REPRESENTATIVE_PAGE_SIZE ||
      (typeof data.total !== "number" || !Number.isSafeInteger(data.total)) || data.total < 0 ||
      typeof data.hasMore !== "boolean" || !Array.isArray(data.rows) ||
      data.rows.length > WORLD_REPRESENTATIVE_PAGE_SIZE) {
    throw new Error("INVALID_WORLD_REPRESENTATIVE_PROJECTION");
  }

  const total = data.total as number;
  if (data.rows.length > Math.max(0, total - offset) ||
      data.hasMore !== (total > offset + WORLD_REPRESENTATIVE_PAGE_SIZE)) {
    throw new Error("INCONSISTENT_WORLD_REPRESENTATIVE_COUNT");
  }

  const seen = new Set<string>();
  const rows: WorldRepresentative[] = data.rows.map((raw) => {
    const item = object(raw);
    const id = required(item?.id);
    const countryId = required(item?.countryId);
    const countryName = required(item?.countryName);
    const countryCode = required(item?.countryCode);
    const displayName = required(item?.displayName);
    const role = required(item?.role);
    const startsAt = utcDate(item?.startsAt);
    const endsAt = item?.endsAt === null ? null : utcDate(item?.endsAt);
    const revision = item?.revision;
    if (!item || !id || seen.has(id) || !countryId || !countryName || !countryCode ||
        !displayName || !role || role.length > 80 || !startsAt ||
        (item.endsAt !== null && !endsAt) ||
        (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) ||
        typeof item.votingAuthority !== "boolean" ||
        (typeof revision !== "number" || !Number.isSafeInteger(revision)) || revision < 1 ||
        (expected.filter === "current" && endsAt) ||
        (expected.filter === "past" && !endsAt)) {
      throw new Error("INVALID_WORLD_REPRESENTATIVE_ROW");
    }
    seen.add(id);
    return {
      id, countryId, countryName, countryCode,
      countryFlagUrl: publicWorldRepresentativeFlag(item.countryFlagUrl),
      displayName, role, startsAt, endsAt,
      votingAuthority: item.votingAuthority as boolean,
      revision: revision as number,
    };
  });

  return {
    organizationId, organizationSlug, organizationName,
    filter: expected.filter, search: normalizedSearch,
    offset, limit: WORLD_REPRESENTATIVE_PAGE_SIZE,
    total, hasMore: data.hasMore, rows,
  };
}
