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


export type AppSearchReturnState = {
  originPath: string;
  query: string;
  resultPath: string;
  createdAt: string;
};

const RETURN_STORAGE_KEY = "solaris:app-search-return:v1";
const RETURN_MAX_AGE_MS = 30 * 60 * 1000;

function normalizePath(value: string) {
  const path = value.split(/[?#]/, 1)[0] || "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function appSearchSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberAppSearchReturn(
  originPath: string,
  query: string,
  resultPath: string,
  storage: Pick<Storage, "setItem"> | null = appSearchSessionStorage(),
) {
  if (!storage) return;
  const state: AppSearchReturnState = {
    originPath: normalizePath(originPath),
    query: normalize(query),
    resultPath: normalizePath(resultPath),
    createdAt: new Date().toISOString(),
  };
  try {
    storage.setItem(RETURN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Search return state is optional app navigation state.
  }
}

export function readAppSearchReturn(
  resultPath?: string,
  storage: Pick<Storage, "getItem" | "removeItem"> | null = appSearchSessionStorage(),
): AppSearchReturnState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSearchReturnState>;
    if (
      typeof parsed.originPath !== "string" ||
      typeof parsed.query !== "string" ||
      typeof parsed.resultPath !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      storage.removeItem(RETURN_STORAGE_KEY);
      return null;
    }

    const createdAt = new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > RETURN_MAX_AGE_MS) {
      storage.removeItem(RETURN_STORAGE_KEY);
      return null;
    }

    const state: AppSearchReturnState = {
      originPath: normalizePath(parsed.originPath),
      query: normalize(parsed.query),
      resultPath: normalizePath(parsed.resultPath),
      createdAt: parsed.createdAt,
    };

    if (resultPath && state.resultPath !== normalizePath(resultPath)) return null;
    return state;
  } catch {
    return null;
  }
}

export function readPendingAppSearchRestore(
  pathname: string,
  storage: Pick<Storage, "getItem" | "removeItem"> | null = appSearchSessionStorage(),
) {
  const state = readAppSearchReturn(undefined, storage);
  return state?.originPath === normalizePath(pathname) ? state : null;
}

export function clearAppSearchReturn(
  storage: Pick<Storage, "removeItem"> | null = appSearchSessionStorage(),
) {
  try {
    storage?.removeItem(RETURN_STORAGE_KEY);
  } catch {
    // Optional navigation state.
  }
}
