/**
 * Government is a public, read-only view of the existing country profile owner.
 * Unstructured lore must never be promoted into canonical offices or law.
 */
export type GovernmentCountry = {
  id: string;
  code: string;
  name: string;
  nativeName: string | null;
  flagImage: string | null;
  region: string | null;
};
export type GovernmentProfile = {
  governmentType: string | null;
  leaderTitle: string | null;
  leaderName: string | null;
  capital: string | null;
  summary: string | null;
  updatedAt: string;
};
export type GovernmentArticle = { id: string; title: string; body: string };
export type GovernmentPublicRead = {
  country: GovernmentCountry;
  profile: GovernmentProfile | null;
  articles: GovernmentArticle[];
  sectionsTruncated: boolean;
};

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const CODE = /^[a-z0-9-]{2,12}$/i;
const POLITICAL_HEADING = /\b(government|politic(?:s|al)|constitution|parliament|legislatur(?:e|es)|cabinet|ministr(?:y|ies)|presiden(?:t|cy)|monarch(?:y|s)|judiciar(?:y|ies)|court(?:s)?|head of state|head of government)\b/i;

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${what}`);
  return value as Record<string, unknown>;
}
function required(value: unknown, what: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${what}`);
  return value.trim();
}
function optional(value: unknown, what: string): string | null {
  return value === null || value === undefined || value === "" ? null : required(value, what);
}
function uuid(value: unknown, what: string): string {
  const id = required(value, what);
  if (!UUID.test(id)) throw new Error(`Invalid ${what}`);
  return id;
}

export function validGovernmentCountryCode(code: string): boolean {
  return CODE.test(code);
}

export function parseGovernmentCountry(value: unknown, requestedCode: string): GovernmentCountry | null {
  if (!validGovernmentCountryCode(requestedCode)) throw new Error("Invalid country code");
  if (value === null) return null;
  const row = record(value, "country");
  const code = required(row.short_code, "country code");
  if (code.toLowerCase() !== requestedCode.toLowerCase()) throw new Error("Country identity does not match route");
  return {
    id: uuid(row.id, "country identity"),
    code,
    name: required(row.name, "country name"),
    nativeName: optional(row.native_name, "native name"),
    region: optional(row.region, "region"),
    flagImage: safeGovernmentImage(row.flag_image),
  };
}

export function safeGovernmentImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

export function parseGovernmentProfile(value: unknown, expectedCountryId: string): GovernmentProfile | null {
  if (value === null) return null;
  const row = record(value, "country government profile");
  if (uuid(row.country_id, "profile country") !== expectedCountryId) {
    throw new Error("Cross-country government profile");
  }
  const updatedAt = required(row.updated_at, "profile update date");
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Invalid government profile update date");
  return {
    governmentType: optional(row.government_type, "government type"),
    leaderTitle: optional(row.leader_title, "leader title"),
    leaderName: optional(row.leader_name, "leader name"),
    capital: optional(row.capital, "capital"),
    summary: optional(row.summary, "profile summary"),
    updatedAt,
  };
}

/**
 * Articles remain explicitly user-authored public background material. A title
 * match is only a presentation filter, NEVER a grant of official authority.
 */
export function parseGovernmentArticles(value: unknown, expectedCountryId: string) {
  if (!Array.isArray(value)) throw new Error("Invalid country profile articles");
  const seen = new Set<string>();
  const articles: GovernmentArticle[] = [];
  for (const raw of value) {
    const row = record(raw, "profile article");
    if (uuid(row.country_id, "article country") !== expectedCountryId) throw new Error("Cross-country public article");
    const id = uuid(row.id, "article identity");
    if (seen.has(id)) throw new Error("Duplicate public country article");
    seen.add(id);
    // The Government route is not a backdoor into country-authored sections
    // hidden from both existing public country and Wiki surfaces.
    if (row.visible_on_country !== true && row.visible_on_wiki !== true) continue;
    const heading = required(row.heading, "article heading");
    if (typeof row.body !== "string") throw new Error("Invalid article body");
    if (POLITICAL_HEADING.test(heading) && row.body.trim()) {
      articles.push({ id, title: heading, body: row.body.trim() });
    }
  }
  return articles;
}

export function hasStructuredGovernment(profile: GovernmentProfile | null): boolean {
  return Boolean(profile?.governmentType || profile?.leaderName || profile?.capital);
}