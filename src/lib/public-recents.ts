export type PublicRecentDestination = {
  path: string;
  label: string;
  visitedAt: number;
};

export const PUBLIC_RECENTS_KEY = "solaris:public-recents";
const MAX_RECENTS = 8;

const SENSITIVE_PREFIXES = [
  "/auth",
  "/reset",
  "/recover",
  "/integrity/appeals/",
  "/integrity/anonymous-appeal",
  "/my-solaris/account",
];

export function shouldRememberPublicPath(path: string) {
  if (!path || path === "/") return false;
  if (path.startsWith("/admin")) return false;
  if (SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return true;
}

export function readPublicRecents(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    const raw = storage.getItem(PUBLIC_RECENTS_KEY);
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
              typeof item.visitedAt === "number",
          ),
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [] as PublicRecentDestination[];
  }
}

export function rememberPublicRecent(
  path: string,
  label: string,
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
) {
  if (!shouldRememberPublicPath(path)) return;

  const previous = readPublicRecents(storage);
  const next: PublicRecentDestination[] = [
    { path, label, visitedAt: Date.now() },
    ...previous.filter((item) => item.path !== path),
  ].slice(0, MAX_RECENTS);

  storage.setItem(PUBLIC_RECENTS_KEY, JSON.stringify(next));
}

export function clearPublicRecents(storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(PUBLIC_RECENTS_KEY, "[]");
}
