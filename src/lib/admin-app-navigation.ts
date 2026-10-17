import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
  type V3OrganizerTabId,
} from "@/lib/v3-organizer";

export type AdminAppTabId = V3OrganizerTabId;

type LegacyAdminAppTabId =
  | "home"
  | "edition"
  | "tasks"
  | "delegations"
  | "more"
  | "inbox"
  | "cases";

export type AdminHistoryEntry = {
  pathname: string;
  searchStr: string;
  scrollY: number;
  visitedAt: string;
};

export type AdminTabState = {
  current: AdminHistoryEntry;
  history: AdminHistoryEntry[];
};

export type AdminNavigationState = {
  version: 2;
  activeTab: AdminAppTabId;
  tabs: Partial<Record<AdminAppTabId, AdminTabState>>;
};

const STORAGE_KEY = "solaris:organizer-navigation:v2";
const LEGACY_STORAGE_KEY = "solaris:organizer-navigation:v1";
const RESTORE_INTENT_KEY = "solaris:organizer-navigation-restore:v1";
const MAX_HISTORY_PER_TAB = 20;

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
  const normalized = value.startsWith("?") ? value : "?" + value;
  return normalized.length <= 2048 ? normalized : "";
}

function safeAdminPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  );
}

/** Legacy route-family helper retained for callers that still need delegation semantics. */
export function adminDelegationRoute(path: string) {
  return (
    path.startsWith("/admin/countries") ||
    path.startsWith("/admin/next-in-line") ||
    path.startsWith("/confirmations/admin") ||
    path.startsWith("/admin/submission-versions")
  );
}

/** Legacy route-family helper retained for edition-workspace callers outside global navigation. */
export function adminEditionRoute(path: string, slug?: string | null) {
  return (
    (slug ? path === "/admin/" + slug : false) ||
    path.startsWith("/admin/shows/") ||
    path.startsWith("/admin/entries/") ||
    path.startsWith("/admin/lineup-sync/") ||
    path.startsWith("/admin/participant-status/") ||
    path.startsWith("/admin/hosts") ||
    path.startsWith("/admin/eligibility") ||
    path.startsWith("/televoting/admin") ||
    path.startsWith("/admin/jury/") ||
    path.startsWith("/admin/voting-system/") ||
    path.startsWith("/admin/televote/") ||
    path.startsWith("/admin/friend-voting") ||
    path.startsWith("/admin/jury-integrity") ||
    path.startsWith("/admin/results") ||
    path.startsWith("/admin/voting-lab") ||
    path.startsWith("/admin/control-room") ||
    path.startsWith("/admin/broadcast-rundown") ||
    path.startsWith("/admin/workflows") ||
    path.startsWith("/admin/incidents") ||
    path.startsWith("/admin/edition-simulator") ||
    path.startsWith("/admin/storytelling") ||
    path.startsWith("/admin/media-assets") ||
    path.startsWith("/admin/communications") ||
    path.startsWith("/admin/publication/") ||
    path.startsWith("/admin/design/") ||
    path.startsWith("/admin/edition-theme/")
  );
}

export function adminCasesRoute(path: string) {
  return (
    path === "/admin/integrity" ||
    path.startsWith("/admin/integrity-") ||
    path.startsWith("/admin/integrity-case/") ||
    path.startsWith("/admin/integrity-resolution/") ||
    path.startsWith("/admin/rules-manager") ||
    path.startsWith("/admin/rule-interpretations")
  );
}

export function adminAppTabRoot(tab: AdminAppTabId, _slug?: string | null) {
  return v3OrganizerTabRoot(tab);
}

export function adminAppTabForPath(
  pathname: string,
  _slug?: string | null,
): AdminAppTabId | null {
  if (!safeAdminPath(pathname)) return null;
  return v3OrganizerTabForPath(pathname);
}

function defaultEntry(tab: AdminAppTabId, slug?: string | null): AdminHistoryEntry {
  return {
    pathname: adminAppTabRoot(tab, slug),
    searchStr: "",
    scrollY: 0,
    visitedAt: new Date(0).toISOString(),
  };
}

function sanitizeEntry(value: unknown): AdminHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AdminHistoryEntry>;
  if (typeof candidate.pathname !== "string" || !safeAdminPath(candidate.pathname)) return null;
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

function emptyState(): AdminNavigationState {
  return { version: 2, activeTab: "overview", tabs: {} };
}

export function adminEntryHref(entry: Pick<AdminHistoryEntry, "pathname" | "searchStr">) {
  return entry.pathname + normalizeSearch(entry.searchStr);
}

function legacyActiveFallback(value: unknown): AdminAppTabId {
  const legacy = value as LegacyAdminAppTabId | undefined;
  if (legacy === "tasks" || legacy === "inbox") return "tasks";
  if (legacy === "edition" || legacy === "delegations") return "control";
  if (legacy === "more" || legacy === "cases") return "more";
  if (V3_ORGANIZER_TAB_ORDER.includes(value as V3OrganizerTabId)) {
    return value as V3OrganizerTabId;
  }
  return "overview";
}

/**
 * Reads both canonical V2 memory and legacy V1 memory. Legacy Home/Edition/
 * Delegations stacks are redistributed by the *current canonical route owner*,
 * so old Control Room history correctly migrates to Live rather than being
 * trapped under the former Edition tab.
 */
export function readAdminNavigationState(
  slug?: string | null,
  storage: StorageReader | null = browserStorage(),
): AdminNavigationState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as {
      version?: 1 | 2;
      activeTab?: AdminAppTabId | LegacyAdminAppTabId;
      tabs?: Record<string, AdminTabState | undefined>;
    };
    const sourceStates = Object.values(parsed.tabs ?? {}).filter(
      (candidate): candidate is AdminTabState => Boolean(candidate),
    );
    const allHistory = sourceStates
      .flatMap((candidate) => (Array.isArray(candidate.history) ? candidate.history : []))
      .map(sanitizeEntry)
      .filter((entry): entry is AdminHistoryEntry => Boolean(entry));
    const allCurrent = sourceStates
      .map((candidate) => sanitizeEntry(candidate.current))
      .filter((entry): entry is AdminHistoryEntry => Boolean(entry));
    const tabs: Partial<Record<AdminAppTabId, AdminTabState>> = {};

    for (const tab of V3_ORGANIZER_TAB_ORDER) {
      const history = allHistory
        .filter((entry) => adminAppTabForPath(entry.pathname, slug) === tab)
        .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
        .slice(-MAX_HISTORY_PER_TAB);
      const current =
        allCurrent
          .filter((entry) => adminAppTabForPath(entry.pathname, slug) === tab)
          .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
          .at(-1) ??
        history.at(-1) ??
        null;

      if (!current) continue;
      tabs[tab] = { current, history: history.length ? history : [current] };
    }

    const activeSourceName = String(parsed.activeTab ?? "");
    const activeSourceCurrent = sanitizeEntry(parsed.tabs?.[activeSourceName]?.current);
    const activeFromRoute = activeSourceCurrent
      ? adminAppTabForPath(activeSourceCurrent.pathname, slug)
      : null;
    const activeTab = activeFromRoute ?? legacyActiveFallback(parsed.activeTab);

    return { version: 2, activeTab, tabs };
  } catch {
    return emptyState();
  }
}

export function writeAdminNavigationState(
  state: AdminNavigationState,
  storage: StorageWriter | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Organizer navigation memory is an enhancement.
  }
}

export function rememberAdminLocation(
  pathname: string,
  searchStr = "",
  scrollY?: number,
  slug?: string | null,
  storage: Storage | null = browserStorage(),
) {
  if (!storage || !safeAdminPath(pathname)) return;
  const tab = adminAppTabForPath(pathname, slug);
  if (!tab) return;

  const state = readAdminNavigationState(slug, storage);
  const previous = state.tabs[tab];
  const next: AdminHistoryEntry = {
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
    last && adminEntryHref(last) === adminEntryHref(next)
      ? [...previous!.history.slice(0, -1), next]
      : [...(previous?.history ?? []), next].slice(-MAX_HISTORY_PER_TAB);

  state.activeTab = tab;
  state.tabs[tab] = { current: next, history };
  writeAdminNavigationState(state, storage);
}

export function updateAdminScrollPosition(
  pathname: string,
  searchStr: string,
  scrollY: number,
  slug?: string | null,
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return;
  const tab = adminAppTabForPath(pathname, slug);
  if (!tab) return;
  const state = readAdminNavigationState(slug, storage);
  const tabState = state.tabs[tab];
  if (!tabState) return;
  const href = pathname + normalizeSearch(searchStr);
  const index = [...tabState.history].map(adminEntryHref).lastIndexOf(href);
  if (index < 0) return;
  const entry = {
    ...tabState.history[index]!,
    scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0),
  };
  const history = [...tabState.history];
  history[index] = entry;
  state.tabs[tab] = {
    current: adminEntryHref(tabState.current) === href ? entry : tabState.current,
    history,
  };
  writeAdminNavigationState(state, storage);
}

export function getAdminAppTabDestination(
  tab: AdminAppTabId,
  slug?: string | null,
  storage: StorageReader | null = browserStorage(),
): AdminHistoryEntry {
  const current = readAdminNavigationState(slug, storage).tabs[tab]?.current;
  if (current && adminAppTabForPath(current.pathname, slug) === tab) return current;
  return defaultEntry(tab, slug);
}

export function resetAdminAppTabToRoot(
  tab: AdminAppTabId,
  slug?: string | null,
  storage: Storage | null = browserStorage(),
) {
  const root = { ...defaultEntry(tab, slug), visitedAt: new Date().toISOString() };
  if (!storage) return root;
  const state = readAdminNavigationState(slug, storage);
  state.activeTab = tab;
  state.tabs[tab] = { current: root, history: [root] };
  writeAdminNavigationState(state, storage);
  return root;
}

export function markAdminNavigationRestore(
  entry: AdminHistoryEntry,
  storage: StorageWriter | null = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      RESTORE_INTENT_KEY,
      JSON.stringify({ href: adminEntryHref(entry), scrollY: entry.scrollY }),
    );
  } catch {
    // Scroll restoration is best effort.
  }
}

export function consumeAdminNavigationRestore(
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
