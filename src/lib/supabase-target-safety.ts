const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const CANONICAL_PRODUCTION_HOSTS = new Set([
  "studio.solaris-song-contest.workers.dev",
]);

export type SupabaseRuntimeContext = {
  browserHostname?: string | null;
  runtimeEnv?: string | null;
};

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isLoopbackSupabaseTarget(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return LOOPBACK_HOSTS.has(normalizeHostname(parsed.hostname));
  } catch {
    return false;
  }
}

export function isCanonicalProductionRuntime(
  context: SupabaseRuntimeContext = {},
) {
  const browserHostname =
    context.browserHostname ??
    (typeof window !== "undefined" ? window.location.hostname : null);
  const runtimeEnv =
    context.runtimeEnv ??
    (typeof process !== "undefined" ? process.env.SOLARIS_RUNTIME_ENV : null);

  if (
    browserHostname &&
    CANONICAL_PRODUCTION_HOSTS.has(normalizeHostname(browserHostname))
  ) {
    return true;
  }

  return runtimeEnv === "production";
}

export function assertNonProductionSupabaseTarget(
  rawUrl: string,
  mode: string | undefined,
  context: SupabaseRuntimeContext = {},
) {
  if (isLoopbackSupabaseTarget(rawUrl)) return;
  if (isCanonicalProductionRuntime(context)) return;

  throw new Error(
    `[Supabase] Refusing non-local target for ${mode || "unknown"} runtime: ${rawUrl}. ` +
      "Only the canonical Solaris production host or an explicitly marked production Worker may use hosted Supabase; development, preview and automated verification must use isolated loopback Supabase.",
  );
}
