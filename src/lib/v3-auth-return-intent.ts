const AUTH_RETURN_BASE = "https://solaris-return.invalid";

const ORGANIZER_RETURN_ROOTS = [
  "/admin",
  "/confirmations/admin",
  "/televoting/admin",
] as const;

/**
 * Normalize a post-authentication return target without allowing the browser's
 * URL parser to turn a path-looking value into another origin.
 *
 * The auth route receives this value from untrusted query-string input. Keep
 * only same-origin absolute paths and preserve their query/hash state.
 */
export function resolveV3AuthReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\\")) {
    return null;
  }

  if (/\p{Cc}/u.test(value)) return null;

  try {
    const base = new URL(AUTH_RETURN_BASE);
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin) return null;
    if (!resolved.pathname.startsWith("/")) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/**
 * Return intents into Organizer-only workspaces must be re-authorized after
 * authentication. Display role/client state is never enough to grant access.
 */
export function v3AuthReturnRequiresOrganizer(path: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(path, AUTH_RETURN_BASE).pathname;
  } catch {
    return false;
  }

  return ORGANIZER_RETURN_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
