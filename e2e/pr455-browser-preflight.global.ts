import { spawnSync } from "node:child_process";

// A browser aimed at a hosted frontend can still hit production Supabase even
// when every local E2E_SUPABASE_URL variable is correctly pinned to loopback.
// Validate the actual browser destination before the preflight skip flags.
export function assertLocalBrowserAuditTarget(
  baseURL: string = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
) {
  let target: URL;
  try {
    target = new URL(baseURL);
  } catch {
    throw new Error("[Browser Audit safety] Invalid E2E_BASE_URL; refusing automated navigation");
  }

  const hostname = target.hostname.toLowerCase() === "[::1]" ? "::1" : target.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(hostname) ||
    target.username ||
    target.password
  ) {
    throw new Error("[Browser Audit safety] E2E_BASE_URL must be an unauthenticated HTTP(S) loopback target");
  }
}

export default async function pr455BrowserPreflight() {
  if (!process.env.CI) return;
  assertLocalBrowserAuditTarget();
  if (process.env.SOLARIS_PR455_PREFLIGHT_CHILD === "1") return;
  if (process.env.SOLARIS_PR455_PREFLIGHT_ALREADY_PASSED === "1") return;

  const result = spawnSync(
    "bunx",
    ["playwright", "test", "--config=playwright.pr455-preflight.config.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SOLARIS_PR455_PREFLIGHT_CHILD: "1",
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `PR455 Organizer regression preflight failed with exit code ${result.status ?? "unknown"}; refusing to start the expensive Browser Audit matrix.`,
    );
  }
}
