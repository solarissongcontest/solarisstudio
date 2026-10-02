export type AdminAppTabId = "home" | "edition" | "tasks" | "delegations" | "more";

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
  version: 1;
  activeTab: AdminAppTabId;
  tabs: Partial<Record<AdminAppTabId, AdminTabState>>;
};

const STORAGE_KEY = "solaris:organizer-navigation:v1";
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

export function adminDelegationRoute(path: string) {
  return (
    path.startsWith("/admin/countries") ||
    path.startsWith("/confirmations/admin") ||
    path.startsWith("/admin/submission-versions")
  );
}

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

export function adminAppTabRoot(tab: AdminAppTabId, slug?: string | null) {
  if (tab === "home") return "/admin/operations";
  if (tab === "edition") return slug ? "/admin/" + slug : "/admin";
  if (tab === "tasks") return "/admin/tasks";
  if (tab === "delegations") return "/admin/countries";
  return "/admin/more";
}

export function adminAppTabForPath(pathname: string, slug?: string | null): AdminAppTabId | null {
  if (!safeAdminPath(pathname)) return null;
  if (pathname.startsWith("/admin/operations")) return "home";
  if (
    pathname.startsWith("/admin/tasks") ||\n    pathname.startsWith("/admin/action-center") ||
    pathname.startsWith("/admin/action-centre") ||
    pathname.startsWith("/admin/inbox")
  ) return "tasks";
  if (adminDelegationRoute(pathname)) return "delegations";
  if (adminEditionRoute(pathname, slug)) return "edition";
  return "more";
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
  return { version: 1, activeTab: "home", tabs: {} };
}

export function adminEntryHref(entry: Pick<AdminHistoryEntry, "pathname" | "searchStr">) {
  return entry.pathname + normalizeSearch(entry.searchStr);
}

export function readAdminNavigationState(
  slug?: string | null,
  storage: StorageReader | null = browserStorage(),
): AdminNavigationState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AdminNavigationState> & {
      activeTab?: AdminAppTabId | "inbox" | "cases";
      tabs?: Record<string, AdminTabState | undefined>;
    };
    const validTabs: AdminAppTabId[] = ["home", "edition", "tasks", "delegations", "more"];
    const migrateTab = (value: unknown): AdminAppTabId => {
      if (value === "inbox") return "tasks";
      if (value === "cases") return "more";
      return validTabs.includes(value as AdminAppTabId) ? (value as AdminAppTabId) : "home";
    };
    const activeTab = migrateTab(parsed.activeTab);
    const tabs: Partial<Record<AdminAppTabId, AdminTabState>> = {};
    const sourceNames: Record<AdminAppTabId, string[]> = {
      home: ["home"],
      edition: ["edition"],
      tasks: ["tasks", "inbox"],
      delegations: ["delegations"],
      more: ["more", "cases"],
    };

    for (const tab of validTabs) {
      const candidates = sourceNames[tab]
        .map((name) => parsed.tabs?.[name])
        .filter((candidate): candidate is AdminTabState => Boolean(candidate));
      if (!candidates.length) continue;

      const history = candidates
        .flatMap((candidate) => (Array.isArray(candidate.history) ? candidate.history : []))
        .map(sanitizeEntry)
        .filter((entry): entry is AdminHistoryEntry => Boolean(entry))
        .filter((entry) => adminAppTabForPath(entry.pathname, slug) === tab)
        .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
        .slice(-MAX_HISTORY_PER_TAB);

      const current =
        candidates
          .map((candidate) => sanitizeEntry(candidate.current))
          .filter((entry): entry is AdminHistoryEntry => Boolean(entry))
          .filter((entry) => adminAppTabForPath(entry.pathname, slug) === tab)
          .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
          .at(-1) ??
        history.at(-1) ??
        null;

      if (!current) continue;
      tabs[tab] = { current, history: history.length ? history : [current] };
    }
    return { version: 1, activeTab, tabs };
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
