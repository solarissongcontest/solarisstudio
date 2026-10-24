const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

export function assertNonProductionSupabaseTarget(
  rawUrl: string,
  mode: string | undefined,
) {
  if (mode === "production") return;

  if (!isLoopbackSupabaseTarget(rawUrl)) {
    throw new Error(
      `[Supabase] Refusing non-local target outside production mode: ${rawUrl}. ` +
        "Solaris development, test, preview-development and automated verification must use isolated loopback Supabase.",
    );
  }
}
