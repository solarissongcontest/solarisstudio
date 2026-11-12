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

const REQUIRED_LOCAL_SUPABASE_URLS = [
  "VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL",
  "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL",
];
const EXTRA_URL_KEYS = new Set(["API_URL", "DB_URL", "DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"]);

function isSupabaseTargetKey(key) {
  return EXTRA_URL_KEYS.has(key) ||
    /(?:^|_)SUPABASE(?:_[A-Z0-9]+)*_URL$/i.test(key) ||
    /SUPABASE_URL$/i.test(key);
}

/** Refuse all hosted DB/client settings before any standalone browser run. */
export function requireLocalPlaywrightSupabaseEnvironment(environment) {
  for (const key of REQUIRED_LOCAL_SUPABASE_URLS) {
    if (typeof environment[key] !== "string" || !environment[key].trim()) {
      throw new Error("[Playwright safety] Missing " + key + "; explicit loopback Supabase configuration is required");
    }
  }
  for (const [key, raw] of Object.entries(environment)) {
    if (!isSupabaseTargetKey(key) || raw == null || raw === "") continue;
    if (typeof raw !== "string" || raw.trim() !== raw) {
      throw new Error("[Playwright safety] Invalid or ambiguous Supabase target " + key);
    }
    let url;
    try { url = new URL(raw); }
    catch { throw new Error("[Playwright safety] Invalid Supabase target " + key); }
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase())) {
      throw new Error("[Playwright safety] Refusing non-local Supabase endpoint in " + key);
    }
    const isDatabaseUrl = ["DB_URL", "DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"].includes(key);
    const validProtocol = isDatabaseUrl
      ? ["postgres:", "postgresql:"].includes(url.protocol)
      : ["http:", "https:"].includes(url.protocol);
    if (!validProtocol) throw new Error("[Playwright safety] Invalid protocol in " + key);
    if ([...url.searchParams.keys()].some((name) => ["host", "hostaddr", "service"].includes(name.toLowerCase()))) {
      throw new Error("[Playwright safety] Supabase database authority override in " + key);
    }
    if (!isDatabaseUrl && (url.username || url.password || url.pathname !== "/" || url.search || url.hash)) {
      throw new Error("[Playwright safety] Supabase HTTP target must be a bare loopback origin in " + key);
    }
    if (isDatabaseUrl && url.hash) {
      throw new Error("[Playwright safety] Ambiguous database target fragment in " + key);
    }
  }
  for (const key of ["PGHOST", "PGHOSTADDR"]) {
    const value = environment[key]?.trim();
    if (!value) continue;
    const allowed = key === "PGHOSTADDR" ? ["127.0.0.1", "::1"] : ["localhost", "127.0.0.1", "::1"];
    if (!allowed.includes(value.toLowerCase())) {
      throw new Error("[Playwright safety] Refusing non-local PostgreSQL routing in " + key);
    }
  }
  for (const key of ["PGSERVICE", "PGSERVICEFILE"]) {
    if (environment[key]?.trim()) {
      throw new Error("[Playwright safety] Refusing opaque PostgreSQL service override in " + key);
    }
  }
  return true;
}
