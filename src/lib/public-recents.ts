import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export type PublicRecentDestination = {
  path: string;
  label: string;
  visitedAt: number;
};

export const PUBLIC_RECENTS_KEY = "solaris:public-recents";
const MAX_RECENTS = 8;

// Recently viewed is shared device storage, not a private activity history.
// Only explicitly public, read-only content may be persisted or redisplayed.
// Unknown routes fail closed, even if the app-screen fallback labels them public.
const PUBLIC_RECENT_DETAIL_PATTERNS = [
  /^\/(?:countries|editions|shows|stories|wiki|encyclopedia|songs|artists)\/[^/?#]+\/?$/,
  /^\/televoting\/results\/?$/,
  /^\/rules\/(?:chapters|participating|interpretations|changes|answers)(?:\/[^/?#]+)?\/?$/,
  // One-segment canonical rule-detail URLs (`/rules/$ruleId`) are public too.
  // Keep administrative and nested paths out of shared-device recent history.
  /^\/rules\/(?!admin\/?$|edit\/?$|manage\/?$)[a-zA-Z0-9][a-zA-Z0-9.-]*\/?$/,
];

const SENSITIVE_PREFIXES = [
  "/auth",
  "/reset",
  "/recover",
  "/integrity/appeals/",
  "/integrity/anonymous-appeal",
  "/my-solaris/account",
];

const NON_CONTENT_RECENT_PATHS = new Set([
  "/",
  "/explore",
  "/participate",
  "/results",
  "/countries",
  "/editions",
  "/shows",
  "/stories",
  "/wiki",
  "/encyclopedia",
  "/guide",
  "/site-directory",
  "/rules",
  "/integrity",
  "/tools",
  "/analysis",
  "/records",
  "/scorecharts",
]);

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeRootRelativePath(path: string) {
  try {
    // Decode once to catch encoded separators and malformed escapes before
    // the router interprets them as a different destination.
    const decoded = decodeURIComponent(path);
    return (
      path.length <= 2048 &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !decoded.includes("//") &&
      !decoded.includes("\\") &&
      !decoded.includes("?") &&
      !decoded.includes("#") &&
      !/\/(?:\.{1,2})(?:\/|$)/.test(decoded) &&
      !containsControlCharacter(decoded) &&
      !/%(?:2f|5c|00|25)/i.test(path) &&
      path.split("/").length === decoded.split("/").length
    );
  } catch {
    return false;
  }
}

export function shouldRememberPublicPath(path: string) {
  if (!path || !isSafeRootRelativePath(path) || NON_CONTENT_RECENT_PATHS.has(path)) {
    return false;
  }

  if (!PUBLIC_RECENT_DETAIL_PATTERNS.some((pattern) => pattern.test(path))) return false;

  const screen = resolveSolarisAppScreen(path);
  if (screen.access.auth !== "public" || screen.behavior.criticalTask || screen.behavior.immersive) {
    return false;
  }

  if (path.startsWith("/admin")) return false;
  if (SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return true;
}

export function readPublicRecents(storage?: Pick<Storage, "getItem">) {
  try {
    const source = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const raw = source?.getItem(PUBLIC_RECENTS_KEY);
    if (!raw) return [] as PublicRecentDestination[];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [] as PublicRecentDestination[];
    return value
      .filter(
        (item): item is PublicRecentDestination =>
          Boolean(
            item &&
              typeof item.path === "string" &&
              typeof item.label === "string" &&
              item.label.trim().length > 0 &&
              item.label.length <= 250 &&
              !containsControlCharacter(item.label) &&
              typeof item.visitedAt === "number" &&
              Number.isFinite(item.visitedAt),
          ),
      )
      .filter((item) => shouldRememberPublicPath(item.path))
      .slice(0, MAX_RECENTS);
  } catch {
    return [] as PublicRecentDestination[];
  }
}

export function rememberPublicRecent(
  path: string,
  label: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  if (
    !shouldRememberPublicPath(path) ||
    !label.trim() ||
    label.length > 250 ||
    containsControlCharacter(label)
  ) return;

  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return;
    const previous = readPublicRecents(target);
    const next: PublicRecentDestination[] = [
      { path, label, visitedAt: Date.now() },
      ...previous.filter((item) => item.path !== path),
    ].slice(0, MAX_RECENTS);

    // Storage can be blocked (e.g. restricted browser contexts). Recents are
    // optional convenience data; failing here must never break navigation.
    target.setItem(PUBLIC_RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A read-only or quota-limited browser still gets the public page.
  }
}

export function clearPublicRecents(storage?: Pick<Storage, "setItem">) {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    target?.setItem(PUBLIC_RECENTS_KEY, "[]");
  } catch {
    // Clear is best-effort when the browser denies storage access.
  }
}
