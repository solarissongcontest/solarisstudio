/**
 * The ordinary Browser Audit must never use a hosted app as its origin.
 *
 * A hosted frontend can silently contact its production Supabase even when
 * the runner's own VITE_SUPABASE_URL variables point at a disposable stack.
 * Validate the Playwright base URL before the web server or browser launches.
 */
export function requireLoopbackBrowserTarget(raw: string): string {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("[Playwright safety] E2E_BASE_URL must be an absolute local HTTP(S) URL");
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("[Playwright safety] Browser Audit requires an HTTP(S) loopback target");
  }

  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new Error(
      "[Playwright safety] Browser Audit refuses non-loopback E2E_BASE_URL; automated testing must not load hosted applications",
    );
  }

  // No credentials or path/query indirection to remote redirects on the
  // local development server. The test suite navigates its own absolute paths.
  if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("[Playwright safety] E2E_BASE_URL must be a bare loopback origin without credentials, path or query");
  }

  return target.origin;
}
