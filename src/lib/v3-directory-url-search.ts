/**
 * Shareable search state for PUBLIC Explore directories only.
 * URL parameters are navigation metadata, never publication or access grants.
 * The directory must still filter every rendered destination by rollout policy.
 */
export const MAX_PUBLIC_DIRECTORY_QUERY_LENGTH = 120;

export type PublicDirectoryUrlSearch = {
  q?: string;
  area?: string;
};

export type EditionDirectoryUrlSearch = {
  q?: string;
  scope?: "latest" | "past";
  order?: "oldest";
};

/** Normalize URL and local values alike to avoid repeated-space rewrite loops. */
export function normalizePublicDirectoryUrlQuery(value: string): string | undefined {
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()
    .slice(0, MAX_PUBLIC_DIRECTORY_QUERY_LENGTH).trim();
  return clean || undefined;
}
function cleanPublicQuery(value: unknown): string | undefined {
  return typeof value === "string" ? normalizePublicDirectoryUrlQuery(value) : undefined;
}

export function parsePublicDirectoryUrlSearch(
  value: Record<string, unknown>,
): PublicDirectoryUrlSearch {
  const requestedArea = value.area;
  return {
    q: cleanPublicQuery(value.q),
    area: typeof requestedArea === "string" &&
      requestedArea !== "all" &&
      /^[a-z0-9][a-z0-9-]{0,63}$/.test(requestedArea)
      ? requestedArea : undefined,
  };
}

export function parseEditionDirectoryUrlSearch(
  value: Record<string, unknown>,
): EditionDirectoryUrlSearch {
  return {
    q: cleanPublicQuery(value.q),
    scope: value.scope === "latest" || value.scope === "past"
      ? value.scope : undefined,
    order: value.order === "oldest" ? "oldest" : undefined,
  };
}
