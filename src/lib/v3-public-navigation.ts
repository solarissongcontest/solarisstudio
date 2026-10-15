import type { AppTabId } from "@/lib/app-navigation";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export type V3PublicTabId = AppTabId;

export type V3PublicHistoryEntry = {
  pathname: string;
  searchStr: string;
  scrollY: number;
  visitedAt: string;
};

type V3PublicTabState = {
  current: V3PublicHistoryEntry;
  history: V3PublicHistoryEntry[];
};

type V3PublicNavigationState = {
  version: 1;
  activeTab: V3PublicTabId;
  tabs: Partial<Record<V3PublicTabId, V3PublicTabState>>;
};

const STORAGE_PREFIX = "solaris:public-v3-navigation:v1";
const RESTORE_PREFIX = "solaris:public-v3-navigation-restore:v1";
const MAX_HISTORY_PER_TAB = 20;
const VALID_TABS: readonly V3PublicTabId[] = [
  "home",
  "explore",
  "participate",
  "results",
  "me",
];

const TAB_ROOTS: Readonly<Record<V3PublicTabId, string>> = {
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

function scopeToken(scopeKey?: string | null) {
  const value = scopeKey?.trim();
  return value ? encodeURIComponent(value) : "anonymous";
}

function storageKey(scopeKey?: string | null) {
  return `${STORAGE_PREFIX}:${scopeToken(scopeKey)}`;
}

function restoreKey(scopeKey?: string | null) {
  return `${RESTORE_PREFIX}:${scopeToken(scopeKey)}`;
}

function normalizeSearch(searchStr?: string | null) {
  if (!searchStr) return "";
  const value = searchStr.trim();
  if (!value) return "";
  const normalized = value.startsWith("?") ? value : `?${value}`;
  return normalized.length <= 2048 ? normalized : "";
}

function rememberedTab(pathname: string, searchStr = ""): V3PublicTabId | null {
  if (!pathname.startsWith("/") || pathname.startsWith("/admin") || pathname.startsWith("/organizer")) {
    return null;
  }

  const screen = resolveSolarisAppScreen(pathname, normalizeSearch(searchStr));
  const tab = screen.hierarchy.rootTab;
  if (!tab || !VALID_TABS.includes(tab)) return null;

  // Focused/immersive/minimal flows intentionally do not become tab-memory
  // destinations. Returning to a top-level area must never resurrect a jury,
  // televote, confirmation, broadcast or other stale focused workflow.
  if (
    screen.behavior.criticalTask ||
    screen.behavior.immersive ||
    screen.chrome.tabbar !== "full"
  ) {
    return null;
  }

  return tab;
}

function emptyState(): V3PublicNavigationState {
  return { version: 1, activeTab: "home", tabs: {} };
}

function sanitizeEntry(value: unknown): V3PublicHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<V3PublicHistoryEntry>;
  if (typeof candidate.pathname !== "string") return null;
  const searchStr = normalizeSearch(candidate.searchStr);
  if (!rememberedTab(candidate.pathname, searchStr)) return null;

  return {
    pathname: candidate.pathname,
    searchStr,
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

function defaultEntry(tab: V3PublicTabId): V3PublicHistoryEntry {
  return {
    pathname: TAB_ROOTS[tab],
    searchStr: "",
    scrollY: 0,
    visitedAt: new Date(0).toISOString(),
  };
}

export function v3PublicEntryHref(
  entry: Pick<V3PublicHistoryEntry, "pathname" | "searchStr">,
) {
  return entry.pathname + normalizeSearch(entry.searchStr);
}

export function readV3PublicNavigationState(
  storage: StorageReader | null = browserStorage(),
  scopeKey?: string | null,
): V3PublicNavigationState {
  if (!storage) return emptyState();

  try {
    const raw = storage.getItem(storageKey(scopeKey));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<V3PublicNavigationState>;
    const activeTab = VALID_TABS.includes(parsed.activeTab as V3PublicTabId)
      ? (parsed.activeTab as V3PublicTabId)
      : "home";
    const tabs: Partial<Record<V3PublicTabId, V3PublicTabState>> = {};

    for (const tab of VALID_TABS) {
      const source = parsed.tabs?.[tab];
      if (!source) continue;
      const history = (Array.isArray(source.history) ? source.history : [])
        .map(sanitizeEntry)
        .filter((entry): entry is V3PublicHistoryEntry => Boolean(entry))
        .filter((entry) => rememberedTab(entry.pathname, entry.searchStr) === tab)
        .slice(-MAX_HISTORY_PER_TAB);
      const current = sanitizeEntry(source.current);
      const validCurrent =
        current && rememberedTab(current.pathname, current.searchStr) === tab ? current : null;
      const resolved = validCurrent ?? history.at(-1) ?? null;
      if (!resolved) continue;
      tabs[tab] = {
        current: resolved,
        history: history.length ? history : [resolved],
      };
    }

    return { version: 1, activeTab, tabs };
  } catch {
    return emptyState();
  }
}

export function writeV3PublicNavigationState(
  state: V3PublicNavigationState,
  storage: StorageWriter | null = browserStorage(),
  scopeKey?: string | null,
) {
  if (!storage) return;
  try {
    storage.setItem(storageKey(scopeKey), JSON.stringify(state));
  } catch {
    // Public navigation memory is progressive enhancement.
  }
}

export function rememberV3PublicLocation(
  pathname: string,
  searchStr = "",
  scrollY?: number,
  storage: Storage | null = browserStorage(),
  scopeKey?: string | null,
) {
  if (!storage) return;
  const tab = rememberedTab(pathname, searchStr);
  if (!tab) return;

  const state = readV3PublicNavigationState(storage, scopeKey);
  const previous = state.tabs[tab];
  const next: V3PublicHistoryEntry = {
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
    last && v3PublicEntryHref(last) === v3PublicEntryHref(next)
      ? [...previous!.history.slice(0, -1), next]
      : [...(previous?.history ?? []), next].slice(-MAX_HISTORY_PER_TAB);

  state.activeTab = tab;
  state.tabs[tab] = { current: next, history };
  writeV3PublicNavigationState(state, storage, scopeKey);
}

export function updateV3PublicScrollPosition(
  pathname: string,
  searchStr: string,
  scrollY: number,
  storage: Storage | null = browserStorage(),
  scopeKey?: string | null,
) {
  if (!storage) return;
  const tab = rememberedTab(pathname, searchStr);
  if (!tab) return;

  const state = readV3PublicNavigationState(storage, scopeKey);
  const tabState = state.tabs[tab];
  if (!tabState) return;
  const href = pathname + normalizeSearch(searchStr);
  const index = [...tabState.history].map(v3PublicEntryHref).lastIndexOf(href);
  if (index < 0) return;

  const entry = {
    ...tabState.history[index]!,
    scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0),
  };
  const history = [...tabState.history];
  history[index] = entry;
  state.tabs[tab] = {
    current: v3PublicEntryHref(tabState.current) === href ? entry : tabState.current,
    history,
  };
  writeV3PublicNavigationState(state, storage, scopeKey);
}

export function getV3PublicTabDestination(
  tab: V3PublicTabId,
  storage: StorageReader | null = browserStorage(),
  scopeKey?: string | null,
): V3PublicHistoryEntry {
  const current = readV3PublicNavigationState(storage, scopeKey).tabs[tab]?.current;
  if (current && rememberedTab(current.pathname, current.searchStr) === tab) return current;
  return defaultEntry(tab);
}

export function resetV3PublicTabToRoot(
  tab: V3PublicTabId,
  storage: Storage | null = browserStorage(),
  scopeKey?: string | null,
) {
  const root = { ...defaultEntry(tab), visitedAt: new Date().toISOString() };
  if (!storage) return root;
  const state = readV3PublicNavigationState(storage, scopeKey);
  state.activeTab = tab;
  state.tabs[tab] = { current: root, history: [root] };
  writeV3PublicNavigationState(state, storage, scopeKey);
  return root;
}

export function markV3PublicNavigationRestore(
  entry: V3PublicHistoryEntry,
  storage: StorageWriter | null = browserSessionStorage(),
  scopeKey?: string | null,
) {
  if (!storage) return;
  try {
    storage.setItem(
      restoreKey(scopeKey),
      JSON.stringify({ href: v3PublicEntryHref(entry), scrollY: entry.scrollY }),
    );
  } catch {
    // Scroll restoration is best effort.
  }
}

export function consumeV3PublicNavigationRestore(
  pathname: string,
  searchStr = "",
  storage: Storage | null = browserSessionStorage(),
  scopeKey?: string | null,
): number | null {
  if (!storage) return null;

  try {
    const key = restoreKey(scopeKey);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { href?: string; scrollY?: number };
    if (parsed.href !== pathname + normalizeSearch(searchStr)) return null;
    storage.removeItem(key);
    return typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
      ? Math.max(0, parsed.scrollY)
      : 0;
  } catch {
    return null;
  }
}

export function v3PublicTabRoot(tab: V3PublicTabId) {
  return TAB_ROOTS[tab];
}
