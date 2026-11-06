import type { PublicSearchResult } from "./public-search";
import { matchesPublicSearch, navigationSearchResults } from "./public-search";

/**
 * The published Search projection remains the source of truth. This helper
 * only ranks already-visible rows and offers bounded, one-edit tolerance
 * for human-facing names. No new index, backend reads, or permissions.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss");
}

function queryTokens(query: string): string[] {
  return fold(query).trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Includes one substitution, insertion/deletion or adjacent swap. */
function isOneEditAway(query: string, candidate: string): boolean {
  if (query === candidate) return false;
  if (query.length < 4 || candidate.length < 3) return false;
  if (Math.abs(query.length - candidate.length) > 1) return false;

  let index = 0;
  while (index < query.length && index < candidate.length && query[index] === candidate[index]) {
    index += 1;
  }

  if (query.length === candidate.length) {
    if (query.slice(index + 1) === candidate.slice(index + 1)) return true;
    return (
      index + 1 < query.length &&
      query[index] === candidate[index + 1] &&
      query[index + 1] === candidate[index] &&
      query.slice(index + 2) === candidate.slice(index + 2)
    );
  }

  if (query.length > candidate.length) {
    return query.slice(index + 1) === candidate.slice(index);
  }
  return query.slice(index) === candidate.slice(index + 1);
}

/** Permit the common SSC22 / SSC-22 shorthand for published SSC 22 labels. */
function matchesEditionCode(query: string, values: Array<string | number | null | undefined>): boolean {
  const code = /^ssc[\s_-]*0*(\d{1,3})$/.exec(fold(query.trim()));
  if (!code) return false;
  const editionNumber = Number(code[1]);
  const haystack = fold(values.filter((value) => value != null).join(" "));
  return new RegExp(`\\bssc[\\s_-]*0*${editionNumber}\\b`).test(haystack);
}

/**
 * Preserve the canonical substring/diacritic matching rules first.
 * Fuzzy matching is intentionally conservative: one typo total, only on
 * words of four or more characters, at most four query terms.
 */
export function matchesV3PublicSearch(
  query: string,
  ...values: Array<string | number | null | undefined>
): boolean {
  if (matchesPublicSearch(query, ...values) || matchesEditionCode(query, values)) return true;

  const terms = queryTokens(query);
  if (!terms.length || terms.length > 4) return false;

  const haystack = fold(values.filter((value) => value != null).join(" "));
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return false;

  let edits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) continue;
    if (edits > 0 || term.length < 4) return false;
    if (!words.some((word) => isOneEditAway(term, word))) return false;
    edits += 1;
  }
  return edits === 1;
}

function relevanceScore(result: PublicSearchResult, query: string): number {
  const q = fold(query.trim()).replace(/\bssc[\s_-]+(?=\d)/g, "ssc");
  const label = fold(result.label).replace(/\bssc[\s_-]+(?=\d)/g, "ssc");
  const keywords = fold(result.keywords ?? "");
  const description = fold(result.description);
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q))) return 2;
  if (label.includes(q)) return 3;
  if (keywords.includes(q)) return 4;
  if (description.includes(q)) return 5;
  if (matchesPublicSearch(query, result.label, result.description, result.keywords)) return 6;
  return 7;
}

/**
 * Preserve exactly the existing discoverable public destination catalog,
 * extending its local matching to one typo. Do not mint destinations or
 * load additional archive data in installed-app Search.
 */
export function navigationV3PublicSearchResults(query: string): PublicSearchResult[] {
  return navigationSearchResults("").filter((item) =>
    matchesV3PublicSearch(query, item.label, item.description, item.keywords),
  );
}

/** Stable ordering preserves provider/editorial priority on tied relevance. */
export function rankV3PublicSearchResults<T extends PublicSearchResult>(
  results: readonly T[],
  query: string,
): T[] {
  if (!query.trim()) return [...results];
  return results
    .map((result, index) => ({ result, index, score: relevanceScore(result, query) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ result }) => result);
}

/**
 * A prolific source must not consume every visible result and hide another
 * relevant category. Reserve one slot per matching group, then fill remaining
 * slots by canonical relevance, preserving relative order and group identity.
 *
 * This runs *after* publication filters and deduplication. It never invents
 * content or increases the existing fifty-result UI budget.
 */
export function limitV3PublicSearchGroups<T extends Pick<PublicSearchResult, "group">>(
  rankedResults: readonly T[],
): T[] {
  const maxTotal = 50;
  const maxPerGroup = 10;
  const chosen = new Set<number>();
  const counts = new Map<string, number>();

  // Preserve even a low-ranked category's best match before larger categories
  // can fill all available slots.
  for (let index = 0; index < rankedResults.length && chosen.size < maxTotal; index += 1) {
    const group = rankedResults[index].group;
    if (counts.has(group)) continue;
    chosen.add(index);
    counts.set(group, 1);
  }
  for (let index = 0; index < rankedResults.length && chosen.size < maxTotal; index += 1) {
    if (chosen.has(index)) continue;
    const group = rankedResults[index].group;
    const count = counts.get(group) ?? 0;
    if (count >= maxPerGroup) continue;
    chosen.add(index);
    counts.set(group, count + 1);
  }
  return rankedResults.filter((_result, index) => chosen.has(index));
}
