export type AppSearchReturnState = {
  originPath: string;
  query: string;
  resultPath: string;
  createdAt: string;
};

const RETURN_KEY = "solaris:app-search-return:v1";
const RECENT_KEY = "solaris:app-search-recent:v1";
const MAX_RECENT_SEARCHES = 6;
const MAX_AGE_MS = 30 * 60 * 1000;

function sessionStorageSafe() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStorageSafe() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export function rememberAppSearchReturn(
  originPath: string,
  query: string,
  resultPath: string,
) {
  const storage = sessionStorageSafe();
  if (!storage) return;
  const state: AppSearchReturnState = {
    originPath: normalizePath(originPath),
    query: query.trim().slice(0, 160),
    resultPath: normalizePath(resultPath),
    createdAt: new Date().toISOString(),
  };
  try {
    storage.setItem(RETURN_KEY, JSON.stringify(state));
  } catch {
    // Search restoration is a progressive enhancement.
  }
}

export function readAppSearchReturn(
  resultPath?: string,
): AppSearchReturnState | null {
  const storage = sessionStorageSafe();
  if (!storage) return null;
  try {
    const raw = storage.getItem(RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppSearchReturnState;
    const created = new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(created) || Date.now() - created > MAX_AGE_MS) {
      storage.removeItem(RETURN_KEY);
      return null;
    }
    if (resultPath && normalizePath(resultPath) !== parsed.resultPath) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumeAppSearchReturn(
  resultPath: string,
): AppSearchReturnState | null {
  const state = readAppSearchReturn(resultPath);
  if (!state) return null;
  try {
    sessionStorageSafe()?.removeItem(RETURN_KEY);
  } catch {
    // Navigation can still fall back to normal app history.
  }
  return state;
}

export function readPendingSearchRestore(pathname: string) {
  const state = readAppSearchReturn();
  if (!state || state.originPath !== normalizePath(pathname)) return null;
  return state;
}

export function clearAppSearchReturn() {
  try {
    sessionStorageSafe()?.removeItem(RETURN_KEY);
  } catch {
    // No-op.
  }
}

export function rememberRecentSearch(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 160);
  if (normalized.length < 2) return;
  const storage = localStorageSafe();
  if (!storage) return;
  const existing = readRecentSearches(storage);
  const next = [
    normalized,
    ...existing.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent searches are optional.
  }
}

export function readRecentSearches(
  storage: Pick<Storage, "getItem"> | null = localStorageSafe(),
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}
