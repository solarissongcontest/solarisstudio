import { publicAreaForPath } from "@/lib/public-navigation";

export type AppTabId = "home" | "explore" | "participate" | "results" | "me";

export type AppHistoryEntry = {
  pathname: string;
  searchStr: string;
  scrollY: number;
  visitedAt: string;
};

export type AppTabState = {
  current: AppHistoryEntry;
  history: AppHistoryEntry[];
};

export type AppNavigationState = {
  version: 1;
  activeTab: AppTabId;
  tabs: Partial<Record<AppTabId, AppTabState>>;
};

const STORAGE_KEY = "solaris:app-navigation:v1";
const RESTORE_INTENT_KEY = "solaris:app-navigation-restore:v1";
const MAX_HISTORY_PER_TAB = 20;

const ROOTS: Record<AppTabId, string> = {
  home: "/",
  explore: "/explore",
  participate: "/participate",
  results: "/results",
  me: "/my-solaris",
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeSearch(searchStr: string | undefined | null) {
  if (!searchStr) return "";
  const trimmed = searchStr.trim();
  if (!trimmed) return "";
  const prefixed = trimmed.startsWith("?") ? trimmed : `?${trimmed}`;
  return prefixed.length <= 2048 ? prefixed : "";
}

function safePath(pathname: string) {
  return (
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/confirmations/admin") &&
    !pathname.startsWith("/televoting/admin")
  );
}

function defaultEntry(tab: AppTabId, signedIn = true): AppHistoryEntry {
  return {
    pathname: appTabRoot(tab, signedIn),
    searchStr: "",
    scrollY: 0,
    visitedAt: new Date(0).toISOString(),
  };
}

function sanitizeEntry(value: unknown): AppHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AppHistoryEntry>;
  if (typeof candidate.pathname !== "string" || !safePath(candidate.pathname)) return null;
  return {
    pathname: candidate.pathname,
    searchStr: normalizeSearch(candidate.searchStr),
    scrollY:
      typeof candidate.scrollY === "number" && Number.isFinite(candidate.scrollY)
        ? Math.max(0, candidate.scrollY)
        : 0,
    visitedAt:
      typeof candidate.visitedAt === "string"
        ? candidate.visitedAt
        : new Date(0).toISOString(),
  };
}

function emptyState(): AppNavigationState {
  return { version: 1, activeTab: "home", tabs: {} };
}

export function appTabRoot(tab: AppTabId, signedIn = true) {
  if (tab === "me" && !signedIn) return "/auth";
  return ROOTS[tab];
}

export function appTabForPath(pathname: string): AppTabId | null {
  const area = publicAreaForPath(pathname);
  return area === "home" ||
    area === "explore" ||
    area === "participate" ||
    area === "results" ||
    area === "me"
    ? area
    : null;
}

export function appEntryHref(entry: Pick<AppHistoryEntry, "pathname" | "searchStr">) {
  return `${entry.pathname}${normalizeSearch(entry.searchStr)}`;
}

export function readAppNavigationState(
  storage: StorageReader | null = browserStorage(),
): AppNavigationState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppNavigationState>;
    const activeTab: AppTabId =
      parsed.activeTab === "home" ||
      parsed.activeTab === "explore" ||
      parsed.activeTab === "participate" ||
      parsed.activeTab === "results" ||
      parsed.activeTab === "me"
        ? parsed.activeTab
        : "home";

    const tabs: Partial<Record<AppTabId, AppTabState>> = {};
    for (const tab of ["home", "explore", "participate", "results", "me"] as const) {
      const candidate = parsed.tabs?.[tab];
      if (!candidate) continue;
      const history = (Array.isArray(candidate.history) ? candidate.history : [])
        .map(sanitizeEntry)
        .filter((entry): entry is AppHistoryEntry => Boolean(entry))
        .filter((entry) => appTabForPath(entry.pathname) === tab)
        .slice(-MAX_HISTORY_PER_TAB);
      const current = sanitizeEntry(candidate.current) ?? history.at(-1) ?? null;
      if (!current || appTabForPath(current.pathname) !== tab) continue;
      tabs[tab] = {
        current,
        history: history.length ? history : [current],
      };
    }
    return { version: 1, activeTab, tabs };
  } catch {
    return emptyState();
  }
}

export function writeAppNavigationState(
  state: AppNavigationState,
  storage: StorageWriter | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navigation memory is an enhancement. Routing must still work without storage.
  }
}

export function rememberAppLocation(
  pathname: string,
  searchStr = "",
  scrollY?: number,
  storage: Storage | null = browserStorage(),
) {
  if (!storage || !safePath(pathname)) return;
  const tab = appTabForPath(pathname);
  if (!tab) return;

  const state = readAppNavigationState(storage);
  const previous = state.tabs[tab];
  const next: AppHistoryEntry = {
    pathname,
    searchStr: normalizeSearch(searchStr),
    scrollY:
      typeof scrollY === "number" && Number.isFinite(scrollY)
        ? Math.max(0, scrollY)
        : previous?.current.scrollY ?? 0,
    visitedAt: new Date().toISOString(),
  };
  const last = previous?.history.at(-1);

  const history =
    last && appEntryHref(last) === appEntryHref(next)
      ? [...previous!.history.slice(0, -1), next]
      : [...(previous?.history ?? []), next].slice(-MAX_HISTORY_PER_TAB);

  state.activeTab = tab;
  state.tabs[tab] = { current: next, history };
  writeAppNavigationState(state, storage);
}

export function updateAppScrollPosition(
  pathname: string,
  searchStr: string,
  scrollY: number,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return;
  const tab = appTabForPath(pathname);
  if (!tab) return;
  const state = readAppNavigationState(storage);
  const tabState = state.tabs[tab];
  if (!tabState) return;
  const href = `${pathname}${normalizeSearch(searchStr)}`;
  const index = [...tabState.history]
    .map(appEntryHref)
    .lastIndexOf(href);
  if (index < 0) return;

  const nextEntry: AppHistoryEntry = {
    ...tabState.history[index]!,
    scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0),
  };
  const history = [...tabState.history];
  history[index] = nextEntry;
  state.tabs[tab] = {
    current: appEntryHref(tabState.current) === href ? nextEntry : tabState.current,
    history,
  };
  writeAppNavigationState(state, storage);
}

function destinationAllowedForSession(entry: AppHistoryEntry, tab: AppTabId, signedIn: boolean) {
  if (appTabForPath(entry.pathname) !== tab) return false;
  if (tab !== "me") return true;
  if (signedIn) return !/^\/(auth|reset|recover)(\/|$)/.test(entry.pathname);
  return !/^\/my-solaris(\/|$)/.test(entry.pathname);
}

export function getAppTabDestination(
  tab: AppTabId,
  signedIn: boolean,
  storage: StorageReader | null = browserStorage(),
): AppHistoryEntry {
  const state = readAppNavigationState(storage);
  const current = state.tabs[tab]?.current;
  if (current && destinationAllowedForSession(current, tab, signedIn)) return current;
  return defaultEntry(tab, signedIn);
}

export function resetAppTabToRoot(
  tab: AppTabId,
  signedIn: boolean,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return defaultEntry(tab, signedIn);
  const state = readAppNavigationState(storage);
  const root = {
    ...defaultEntry(tab, signedIn),
    visitedAt: new Date().toISOString(),
  };
  state.activeTab = tab;
  state.tabs[tab] = { current: root, history: [root] };
  writeAppNavigationState(state, storage);
  return root;
}

function currentHistoryIndex(tabState: AppTabState, pathname: string, searchStr: string) {
  const href = `${pathname}${normalizeSearch(searchStr)}`;
  for (let index = tabState.history.length - 1; index >= 0; index -= 1) {
    if (appEntryHref(tabState.history[index]!) === href) return index;
  }
  return -1;
}

export function peekAppBackTarget(
  pathname: string,
  searchStr = "",
  storage: StorageReader | null = browserStorage(),
): AppHistoryEntry | null {
  const tab = appTabForPath(pathname);
  if (!tab) return null;
  const tabState = readAppNavigationState(storage).tabs[tab];
  if (!tabState) return null;
  const index = currentHistoryIndex(tabState, pathname, searchStr);
  if (index > 0) return tabState.history[index - 1]!;
  if (index < 0) {
    const last = tabState.history.at(-1);
    return last && appEntryHref(last) !== `${pathname}${normalizeSearch(searchStr)}`
      ? last
      : null;
  }
  return null;
}

export function popAppBackTarget(
  pathname: string,
  searchStr = "",
  storage: Storage | null = browserStorage(),
): AppHistoryEntry | null {
  if (!storage) return null;
  const tab = appTabForPath(pathname);
  if (!tab) return null;
  const state = readAppNavigationState(storage);
  const tabState = state.tabs[tab];
  if (!tabState) return null;
  const index = currentHistoryIndex(tabState, pathname, searchStr);
  if (index === 0) return null;

  if (index < 0) {
    const target = tabState.history.at(-1) ?? null;
    if (target) state.activeTab = tab;
    writeAppNavigationState(state, storage);
    return target;
  }

  const target = tabState.history[index - 1]!;
  const history = tabState.history.slice(0, index);
  state.activeTab = tab;
  state.tabs[tab] = { current: target, history };
  writeAppNavigationState(state, storage);
  return target;
}

export function markAppNavigationRestore(
  entry: AppHistoryEntry,
  storage: StorageWriter | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      RESTORE_INTENT_KEY,
      JSON.stringify({
        href: appEntryHref(entry),
        scrollY: entry.scrollY,
      }),
    );
  } catch {
    // Scroll restoration is best effort.
  }
}

export function consumeAppNavigationRestore(
  pathname: string,
  searchStr = "",
  storage: Storage | null = browserSessionStorage(),
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESTORE_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { href?: string; scrollY?: number };
    if (parsed.href !== `${pathname}${normalizeSearch(searchStr)}`) return null;
    storage.removeItem(RESTORE_INTENT_KEY);
    return typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
      ? Math.max(0, parsed.scrollY)
      : 0;
  } catch {
    return null;
  }
}
