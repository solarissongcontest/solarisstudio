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

function normalizedTerms(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTerms(haystack: string, terms: string[]) {
  return terms.every((term) => haystack.includes(term));
}
