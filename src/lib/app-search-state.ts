const STORAGE_KEY = "solaris:app-search:v1";
const MAX_RECENT_QUERIES = 6;

type AppSearchState = {
  lastQuery: string;
  recentQueries: string[];
};

const EMPTY: AppSearchState = {
  lastQuery: "",
  recentQueries: [],
};

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function readAppSearchState(
  storage: Pick<Storage, "getItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): AppSearchState {
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AppSearchState>;
    const recent = Array.isArray(parsed.recentQueries)
      ? parsed.recentQueries
          .filter((item): item is string => typeof item === "string")
          .map(normalize)
          .filter(Boolean)
          .slice(0, MAX_RECENT_QUERIES)
      : [];
    return {
      lastQuery: typeof parsed.lastQuery === "string" ? normalize(parsed.lastQuery) : "",
      recentQueries: [...new Set(recent)],
    };
  } catch {
    return EMPTY;
  }
}

export function rememberAppSearchQuery(
  query: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  const normalized = normalize(query);
  if (!storage || normalized.length < 2) return readAppSearchState(storage);

  const current = readAppSearchState(storage);
  const next: AppSearchState = {
    lastQuery: normalized,
    recentQueries: [
      normalized,
      ...current.recentQueries.filter(
        (item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase(),
      ),
    ].slice(0, MAX_RECENT_QUERIES),
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Search history is optional local UX state.
  }

  return next;
}

export function clearLastAppSearchQuery(
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return;
  const current = readAppSearchState(storage);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...current, lastQuery: "" }));
  } catch {
    // Optional local UX state.
  }
}
