/**
 * Validated, navigation-only URL state for already-public Explore collections.
 * These values cannot authorize an unpublished destination or a private record.
 */
import { normalizePublicDirectoryUrlQuery } from "./v3-directory-url-search";

export const PUBLIC_SHOW_STATES = [
  "live", "paused", "delayed", "preparing", "scheduled",
  "ended", "cancelled", "archived", "other",
] as const;
export type PublicShowDirectoryState = (typeof PUBLIC_SHOW_STATES)[number];

export type ShowDirectoryUrlSearch = {
  q?: string;
  edition?: string;
  kind?: string;
  state?: PublicShowDirectoryState;
};

export type CountryDirectoryUrlSearch = {
  q?: string;
  region?: string;
  scope?: "participants";
};

/** Format restrictions prevent accidental huge/invalid facets. Actual public
 * facet validity is checked against the currently published collection. */
function cleanSlug(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
    && value !== "all" ? value : undefined;
}
function cleanRegion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 80 || cleaned === "all") return undefined;
  return cleaned;
}

export function parseShowDirectoryUrlSearch(
  input: Record<string, unknown>,
): ShowDirectoryUrlSearch {
  return {
    q: typeof input.q === "string" ? normalizePublicDirectoryUrlQuery(input.q) : undefined,
    edition: cleanSlug(input.edition),
    kind: cleanSlug(input.kind),
    state: typeof input.state === "string" &&
      (PUBLIC_SHOW_STATES as readonly string[]).includes(input.state)
      ? input.state as PublicShowDirectoryState : undefined,
  };
}

export function parseCountryDirectoryUrlSearch(
  input: Record<string, unknown>,
): CountryDirectoryUrlSearch {
  return {
    q: typeof input.q === "string" ? normalizePublicDirectoryUrlQuery(input.q) : undefined,
    region: cleanRegion(input.region),
    scope: input.scope === "participants" ? "participants" : undefined,
  };
}
