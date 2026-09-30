export type OrganizerSectionId = "home" | "inbox" | "edition" | "cases" | "more";

export type OrganizerNavigationEntry = {
  pathname: string;
  scrollY: number;
  updatedAt: string;
  contextKey: string | null;
};

type OrganizerNavigationState = {
  version: 1;
  sections: Partial<Record<OrganizerSectionId, OrganizerNavigationEntry>>;
};

const STORAGE_KEY = "solaris:organizer-navigation:v1";
const RESTORE_KEY = "solaris:organizer-navigation-restore:v1";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function localStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeOrganizerPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  );
}

const CASE_PREFIXES = [
  "/admin/integrity",
  "/admin/integrity-",
  "/admin/integrity-case/",
  "/admin/integrity-resolution/",
  "/admin/rules-manager",
  "/admin/rule-interpretations",
] as const;

const EDITION_PREFIXES = [
  "/admin/countries",
  "/confirmations/admin",
  "/admin/shows/",
  "/admin/entries/",
  "/admin/lineup-sync/",
  "/admin/participant-status/",
  "/admin/hosts",
  "/admin/eligibility",
  "/admin/submission-versions",
  "/televoting/admin",
  "/admin/jury/",
  "/admin/voting-system/",
  "/admin/televote/",
  "/admin/friend-voting",
  "/admin/jury-integrity",
  "/admin/results",
  "/admin/voting-lab",
  "/admin/control-room",
  "/admin/broadcast-rundown",
  "/admin/workflows",
  "/admin/incidents",
  "/admin/edition-simulator",
  "/admin/storytelling",
  "/admin/media-assets",
  "/admin/communications",
  "/admin/publication/",
  "/admin/design/",
  "/admin/edition-theme/",
] as const;

export function organizerSectionForPath(
  pathname: string,
  editionRoot: string,
): OrganizerSectionId {
  if (pathname.startsWith("/admin/operations")) return "home";
  if (pathname.startsWith("/admin/inbox")) return "inbox";
  if (CASE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return "cases";
  }
  if (
    pathname === editionRoot ||
    EDITION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
  ) {
    return "edition";
  }
  return "more";
}

function readState(storage: StorageReader | null = localStorageSafe()): OrganizerNavigationState {
  if (!storage) return { version: 1, sections: {} };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, sections: {} };
    const parsed = JSON.parse(raw) as Partial<OrganizerNavigationState>;
    const sections: OrganizerNavigationState["sections"] = {};

    for (const section of ["home", "inbox", "edition", "cases", "more"] as const) {
      const candidate = parsed.sections?.[section];
      if (
        !candidate ||
        typeof candidate.pathname !== "string" ||
        !safeOrganizerPath(candidate.pathname)
      ) {
        continue;
      }
      sections[section] = {
        pathname: candidate.pathname,
        scrollY:
          typeof candidate.scrollY === "number" && Number.isFinite(candidate.scrollY)
            ? Math.max(0, candidate.scrollY)
            : 0,
        updatedAt:
          typeof candidate.updatedAt === "string"
            ? candidate.updatedAt
            : new Date(0).toISOString(),
        contextKey:
          typeof candidate.contextKey === "string" ? candidate.contextKey : null,
      };
    }

    return { version: 1, sections };
  } catch {
    return { version: 1, sections: {} };
  }
}

function writeState(
  state: OrganizerNavigationState,
  storage: StorageWriter | null = localStorageSafe(),
) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Organizer navigation memory is an enhancement only.
  }
}

export function rememberOrganizerLocation(
  pathname: string,
  editionRoot: string,
  editionContextKey: string | null,
  scrollY?: number,
  storage: Storage | null = localStorageSafe(),
) {
  if (!storage || !safeOrganizerPath(pathname)) return;
  const section = organizerSectionForPath(pathname, editionRoot);
  const state = readState(storage);
  const previous = state.sections[section];
  state.sections[section] = {
    pathname,
    scrollY:
      typeof scrollY === "number" && Number.isFinite(scrollY)
        ? Math.max(0, scrollY)
        : previous?.scrollY ?? 0,
    updatedAt: new Date().toISOString(),
    contextKey: section === "edition" ? editionContextKey : null,
  };
  writeState(state, storage);
}

export function getOrganizerSectionDestination(
  section: OrganizerSectionId,
  rootPath: string,
  contextKey: string | null,
  storage: StorageReader | null = localStorageSafe(),
): OrganizerNavigationEntry {
  const stored = readState(storage).sections[section];
  if (
    stored &&
    safeOrganizerPath(stored.pathname) &&
    (section !== "edition" || stored.contextKey === contextKey)
  ) {
    return stored;
  }

  return {
    pathname: rootPath,
    scrollY: 0,
    updatedAt: new Date(0).toISOString(),
    contextKey: section === "edition" ? contextKey : null,
  };
}

export function resetOrganizerSection(
  section: OrganizerSectionId,
  rootPath: string,
  contextKey: string | null,
  storage: Storage | null = localStorageSafe(),
) {
  const entry: OrganizerNavigationEntry = {
    pathname: rootPath,
    scrollY: 0,
    updatedAt: new Date().toISOString(),
    contextKey: section === "edition" ? contextKey : null,
  };
  if (!storage) return entry;
  const state = readState(storage);
  state.sections[section] = entry;
  writeState(state, storage);
  return entry;
}

export function updateOrganizerScroll(
  pathname: string,
  editionRoot: string,
  editionContextKey: string | null,
  scrollY: number,
  storage: Storage | null = localStorageSafe(),
) {
  if (!storage) return;
  const section = organizerSectionForPath(pathname, editionRoot);
  const state = readState(storage);
  const current = state.sections[section];
  if (!current || current.pathname !== pathname) return;
  state.sections[section] = {
    ...current,
    scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0),
    contextKey: section === "edition" ? editionContextKey : null,
  };
  writeState(state, storage);
}

export function markOrganizerNavigationRestore(
  entry: OrganizerNavigationEntry,
  storage: StorageWriter | null = sessionStorageSafe(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      RESTORE_KEY,
      JSON.stringify({ pathname: entry.pathname, scrollY: entry.scrollY }),
    );
  } catch {
    // Scroll restoration is best effort.
  }
}

export function consumeOrganizerNavigationRestore(
  pathname: string,
  storage: Storage | null = sessionStorageSafe(),
) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pathname?: string; scrollY?: number };
    if (parsed.pathname !== pathname) return null;
    storage.removeItem(RESTORE_KEY);
    return typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
      ? Math.max(0, parsed.scrollY)
      : 0;
  } catch {
    return null;
  }
}
