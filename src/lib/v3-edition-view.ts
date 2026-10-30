export const V3_EDITION_OVERVIEW_LIMITS = {
  participants: 8,
  songs: 6,
  schedule: 3,
  storyItems: 3,
  resultRows: 3,
} as const;

export type V3EditionCollectionView = "participants" | "songs" | "schedule";

const COLLECTION_VIEWS = new Set<V3EditionCollectionView>([
  "participants",
  "songs",
  "schedule",
]);

export function resolveV3EditionCollectionView(
  search: string,
): V3EditionCollectionView | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get("view");
  return value && COLLECTION_VIEWS.has(value as V3EditionCollectionView)
    ? (value as V3EditionCollectionView)
    : null;
}

function splitHref(href: string): {
  pathname: string;
  search: URLSearchParams;
  hash: string;
} {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return { pathname, search: new URLSearchParams(query), hash };
}

export function v3EditionViewHref(
  editionHref: string,
  view: V3EditionCollectionView,
): string {
  const parts = splitHref(editionHref);
  parts.search.set("view", view);
  const query = parts.search.toString();
  return `${parts.pathname}${query ? `?${query}` : ""}`;
}

export function v3EditionOverviewHref(editionHref: string): string {
  const parts = splitHref(editionHref);
  parts.search.delete("view");
  const query = parts.search.toString();
  return `${parts.pathname}${query ? `?${query}` : ""}${parts.hash}`;
}
