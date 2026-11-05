import {
  PUBLIC_DESTINATIONS,
  publicSearchText,
  type PublicDestination,
} from "./public-navigation";

export type PublicSearchResult = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: string;
  keywords?: string;
};

export function navigationSearchResults(query: string): PublicSearchResult[] {
  const terms = normalizedTerms(query);
  const items = PUBLIC_DESTINATIONS.filter(
    (item) => item.discoverable !== false && matchesTerms(publicSearchText(item), terms),
  );
  return items.map(navigationResult);
}

export function matchesPublicSearch(
  query: string,
  ...values: Array<string | number | null | undefined>
) {
  const terms = normalizedTerms(query);
  if (!terms.length) return true;
  const haystack = values
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
  return matchesTerms(haystack, terms);
}

export function dedupePublicSearchResults(results: PublicSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.href}|${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function navigationResult(item: PublicDestination): PublicSearchResult {
  return {
    id: `nav:${item.id}`,
    label: item.label,
    description: item.description,
    href: item.to,
    group:
      item.area === "help"
        ? "Rules & help"
        : item.area.charAt(0).toUpperCase() + item.area.slice(1),
    keywords: publicSearchText(item),
  };
}

// Solaris country and artist names can contain Å, Ø, Æ and other
// non-ASCII characters. Fold search text only, never canonical names/IDs.
function foldedSearchText(value: string) {
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

function normalizedTerms(query: string) {
  return foldedSearchText(query.trim()).split(/\s+/).filter(Boolean);
}

function matchesTerms(haystack: string, terms: string[]) {
  const normalized = foldedSearchText(haystack);
  return terms.every((term) => normalized.includes(term));
}
