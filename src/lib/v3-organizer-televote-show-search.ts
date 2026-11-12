/**
 * Explicitly malformed ?show= values must not be treated as a missing
 * parameter: doing so silently substitutes the first show and its totals.
 * Query parsers can supply null, arrays or empty strings for malformed URLs.
 */
export type TelevoteShowSearch = {
  show?: string;
  invalidShow?: boolean;
};

export function parseTelevoteShowSearch(search: Record<string, unknown>): TelevoteShowSearch {
  if (search.show === undefined) return {};
  if (typeof search.show !== "string" || !search.show.trim()) {
    return { invalidShow: true };
  }
  return { show: search.show.trim() };
}
