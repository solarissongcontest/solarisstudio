import {
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
  type V3OrganizerTabId,
} from "./v3-organizer";

export type V3OrganizerHistoryEntry = {
  pathname: string;
  searchStr: string;
  scrollY: number;
  visitedAt: string;
};

type V3OrganizerTabState = {
  current: V3OrganizerHistoryEntry;
  history: V3OrganizerHistoryEntry[];
};

type V3OrganizerNavigationState = {
  version: 1;
  activeTab: V3OrganizerTabId;
  tabs: Partial<Record<V3OrganizerTabId, V3OrganizerTabState>>;
};

const STORAGE_KEY = "solaris:organizer-v3-navigation:v1";
const RESTORE_INTENT_KEY = "solaris:organizer-v3-navigation-restore:v1";
const MAX_HISTORY_PER_TAB = 20;
const VALID_TABS: readonly V3OrganizerTabId[] = ["overview", "tasks", "control", "live", "more"];

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

function normalizeSearch(searchStr?: string | null) {
  if (!searchStr) return "";
  const value = searchStr.trim();
  if (!value) return "";
  const normalized = value.startsWith("?") ? value : `?${value}`;
  return normalized.length <= 2048 ? normalized : "";
}

function safeOrganizerPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  );
}

function emptyState(): V3OrganizerNavigationState {
  return { version: 1, activeTab: "overview", tabs: {} };
}

function sanitizeEntry(value: unknown): V3OrganizerHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<V3OrganizerHistoryEntry>;
  if (typeof candidate.pathname !== "string" || !safeOrganizerPath(candidate.pathname)) return null;
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

function defaultEntry(tab: V3OrganizerTabId): V3OrganizerHistoryEntry {
  return {
    pathname: v3OrganizerTabRoot(tab),
    searchStr: "",
    scrollY: 0,
    visitedAt: new Date(0).toISOString(),
  };
}

export function v3OrganizerEntryHref(
  entry: Pick<V3OrganizerHistoryEntry, "pathname" | "searchStr">,
) {
  return entry.pathname + normalizeSearch(entry.searchStr);
}

export function readV3OrganizerNavigationState(
  storage: StorageReader | null = browserStorage(),
): V3OrganizerNavigationState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<V3OrganizerNavigationState>;
    const activeTab = VALID_TABS.includes(parsed.activeTab as V3OrganizerTabId)
      ? (parsed.activeTab as V3OrganizerTabId)
      : "overview";
    const tabs: Partial<Record<V3OrganizerTabId, V3OrganizerTabState>> = {};

    for (const tab of VALID_TABS) {
      const source = parsed.tabs?.[tab];
      if (!source) continue;
      const history = (Array.isArray(source.history) ? source.history : [])
        .map(sanitizeEntry)
        .filter((entry): entry is V3OrganizerHistoryEntry => Boolean(entry))
        .filter((entry) => v3OrganizerTabForPath(entry.pathname) === tab)
        .slice(-MAX_HISTORY_PER_TAB);
      const current = sanitizeEntry(source.current);
      const validCurrent = current && v3OrganizerTabForPath(current.pathname) === tab ? current : null;
      const resolved = validCurrent ?? history.at(-1) ?? null;
      if (!resolved) continue;
      tabs[tab] = { current: resolved, history: history.length ? history : [resolved] };
    }

    return { version: 1, activeTab, tabs };
  } catch {
    return emptyState();
  }
}

export function writeV3OrganizerNavigationState(
  state: V3OrganizerNavigationState,
  storage: StorageWriter | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Organizer navigation memory is progressive enhancement.
  }
}

export function rememberV3OrganizerLocation(
  pathname: string,
  searchStr = "",
  scrollY?: number,
  storage: Storage | null = browserStorage(),
) {
  if (!storage || !safeOrganizerPath(pathname)) return;
  const tab = v3OrganizerTabForPath(pathname);
  const state = readV3OrganizerNavigationState(storage);
  const previous = state.tabs[tab];
  const next: V3OrganizerHistoryEntry = {
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
    last && v3OrganizerEntryHref(last) === v3OrganizerEntryHref(next)
      ? [...previous!.history.slice(0, -1), next]
      : [...(previous?.history ?? []), next].slice(-MAX_HISTORY_PER_TAB);

  state.activeTab = tab;
  state.tabs[tab] = { current: next, history };
  writeV3OrganizerNavigationState(state, storage);
}

export function updateV3OrganizerScrollPosition(
  pathname: string,
  searchStr: string,
  scrollY: number,
  storage: Storage | null = browserStorage(),
) {
  if (!storage || !safeOrganizerPath(pathname)) return;
  const tab = v3OrganizerTabForPath(pathname);
  const state = readV3OrganizerNavigationState(storage);
  const tabState = state.tabs[tab];
  if (!tabState) return;
  const href = pathname + normalizeSearch(searchStr);
  const index = [...tabState.history].map(v3OrganizerEntryHref).lastIndexOf(href);
  if (index < 0) return;
  const entry = {
    ...tabState.history[index]!,
    scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0),
  };
  const history = [...tabState.history];
  history[index] = entry;
  state.tabs[tab] = {
    current: v3OrganizerEntryHref(tabState.current) === href ? entry : tabState.current,
    history,
  };
  writeV3OrganizerNavigationState(state, storage);
}

export function getV3OrganizerTabDestination(
  tab: V3OrganizerTabId,
  storage: StorageReader | null = browserStorage(),
): V3OrganizerHistoryEntry {
  const current = readV3OrganizerNavigationState(storage).tabs[tab]?.current;
  if (current && v3OrganizerTabForPath(current.pathname) === tab) return current;
  return defaultEntry(tab);
}

export function resetV3OrganizerTabToRoot(
  tab: V3OrganizerTabId,
  storage: Storage | null = browserStorage(),
) {
  const root = { ...defaultEntry(tab), visitedAt: new Date().toISOString() };
  if (!storage) return root;
  const state = readV3OrganizerNavigationState(storage);
  state.activeTab = tab;
  state.tabs[tab] = { current: root, history: [root] };
  writeV3OrganizerNavigationState(state, storage);
  return root;
}

export function markV3OrganizerNavigationRestore(
  entry: V3OrganizerHistoryEntry,
  storage: StorageWriter | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      RESTORE_INTENT_KEY,
      JSON.stringify({ href: v3OrganizerEntryHref(entry), scrollY: entry.scrollY }),
    );
  } catch {
    // Scroll restoration is best effort.
  }
}

export function consumeV3OrganizerNavigationRestore(
  pathname: string,
  searchStr = "",
  storage: Storage | null = browserSessionStorage(),
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESTORE_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { href?: string; scrollY?: number };
    if (parsed.href !== pathname + normalizeSearch(searchStr)) return null;
    storage.removeItem(RESTORE_INTENT_KEY);
    return typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
      ? Math.max(0, parsed.scrollY)
      : 0;
  } catch {
    return null;
  }
}
