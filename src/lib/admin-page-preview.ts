import { publicLaunchPath } from "./public-launch-availability";

/** Read-only page discovery is separate from data, mutation and publication authorization. */
export const ADMIN_PAGE_PREVIEW_SESSION_PATH = "/api/admin-page-preview-session";
export const ADMIN_PAGE_PREVIEW_COOKIE = "solaris_admin_page_preview";
export const ADMIN_PAGE_PREVIEW_MAX_AGE = 15 * 60;

export function isAdminPreviewPagePath(href: string): boolean {
  const path = publicLaunchPath(href);
  if (path === null || !path.startsWith("/")) return false;
  if (
    path === "/api" || path.startsWith("/api/") ||
    path === "/admin" || path.startsWith("/admin/") ||
    path.startsWith("/_") || path.startsWith("/.") ||
    path.startsWith("/__")
  ) return false;
  return true;
}

type PreviewSupabaseConfig = {
  url: string;
  publishableKey: string;
};

/** Reverify the bearer against Supabase Auth AND the same active global role
 * query used by OrganizerAccessGate. No service-role key or client role hint.
 * This is only called for explicit admin preview requests, never on public crawls. */
export async function verifyAdminPagePreviewToken(
  token: string,
  config: PreviewSupabaseConfig,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 4096) return false;
  if (!config.publishableKey || !config.url) return false;
  try {
    const base = new URL(config.url);
    const local = base.hostname === "localhost" || base.hostname === "127.0.0.1";
    if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
      base.username || base.password || base.search || base.hash) return false;
    const origin = base.origin;
    const headers = {
      apikey: config.publishableKey,
      authorization: `Bearer ${token}`,
    };
    const auth = await fetcher(`${origin}/auth/v1/user`, {
      headers, cache: "no-store", redirect: "error",
    });
    if (!auth.ok) return false;
    const user = await auth.json() as { id?: unknown };
    if (typeof user?.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(user.id)) return false;

    const roleUrl = new URL("/rest/v1/studio2_role_assignments", origin);
    roleUrl.searchParams.set("select", "id");
    roleUrl.searchParams.set("user_id", `eq.${user.id}`);
    roleUrl.searchParams.set("role_key", "in.(organizer,superadmin)");
    roleUrl.searchParams.set("edition_id", "is.null");
    roleUrl.searchParams.set("or", `(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`);
    roleUrl.searchParams.set("limit", "1");
    const roles = await fetcher(roleUrl.toString(), {
      headers, cache: "no-store", redirect: "error",
    });
    if (!roles.ok) return false;
    const rows = await roles.json() as unknown;
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}
