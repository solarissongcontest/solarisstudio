/**
 * Browser-driven verification must target a loopback app server, never a hosted
 * frontend that could use Solaris Studio's production Supabase configuration.
 *
 * Keep this tiny and dependency-free so Playwright can fail before launching a
 * browser or starting any network traffic.
 */
export function requireLocalPlaywrightTarget(configuredUrl, fallbackUrl) {
  const rawValue = configuredUrl === undefined ? fallbackUrl : configuredUrl;
  if (typeof rawValue !== "string" || rawValue.trim() !== rawValue || !rawValue) {
    throw new Error("[Playwright safety] E2E_BASE_URL must be an explicit loopback HTTP(S) origin");
  }

  let target;
  try {
    target = new URL(rawValue);
  } catch {
    throw new Error("[Playwright safety] E2E_BASE_URL is not an absolute loopback HTTP(S) URL");
  }

  const hostname = target.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  if (!loopback || !["http:", "https:"].includes(target.protocol)) {
    throw new Error("[Playwright safety] Refusing non-local E2E_BASE_URL; automated browsers must not visit hosted frontends");
  }
  if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("[Playwright safety] E2E_BASE_URL must be a bare loopback origin with no credentials, path, query or fragment");
  }
  return target.origin;
}
