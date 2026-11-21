import type { FanRecordCategory } from "./fan-records";

export type RecordsDirectoryCategory = FanRecordCategory | "all";
export type RecordsDirectoryState = {
  category: RecordsDirectoryCategory;
  search: string;
};

const VALID_CATEGORIES = new Set<RecordsDirectoryCategory>([
  "all", "career", "streaks", "edition", "voting", "regional", "unusual",
]);
const DEFAULT_CATEGORY: RecordsDirectoryCategory = "career";
const MAX_SEARCH_LENGTH = 160;

/** Browser-only state. No published source, publication or voting changes. */
export function parseRecordsDirectoryState(search: string): RecordsDirectoryState {
  const params = new URLSearchParams(search);
  const category = params.get("category");
  return {
    category: category && VALID_CATEGORIES.has(category as RecordsDirectoryCategory)
      ? category as RecordsDirectoryCategory
      : DEFAULT_CATEGORY,
    search: (params.get("q") ?? "").slice(0, MAX_SEARCH_LENGTH),
  };
}

/** Keep unrelated query fields intact, including the current URL hash. */
export function createRecordsDirectorySearch(
  currentSearch: string,
  state: RecordsDirectoryState,
): string {
  const params = new URLSearchParams(currentSearch);
  if (state.category === DEFAULT_CATEGORY) params.delete("category");
  else params.set("category", state.category);

  const search = state.search.trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) params.set("q", search);
  else params.delete("q");

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
