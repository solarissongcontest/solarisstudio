import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADMIN_PAGE_PREVIEW_MAX_AGE,
  ADMIN_PAGE_PREVIEW_SESSION_PATH,
  isAdminPreviewPagePath,
  verifyAdminPagePreviewToken,
} from "./admin-page-preview";
import { publicLaunchAllows } from "./public-launch-availability";

const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature";
const actor = "01234567-89ab-4cde-8fed-123456789abc";
const config = { url: "http://127.0.0.1:54321", publishableKey: "local-test-anon-key" };

describe("Organizer hidden-page preview", () => {
  it("does not change public-release decisions or grant generic server/API routes", () => {
    expect(publicLaunchAllows("/countries")).toBe(false);
    expect(publicLaunchAllows("/results")).toBe(false);
    expect(ADMIN_PAGE_PREVIEW_SESSION_PATH).toBe("/api/admin-page-preview-session");
    expect(ADMIN_PAGE_PREVIEW_MAX_AGE).toBeLessThanOrEqual(15 * 60);
    for (const path of ["/countries", "/results", "/fantasy", "/world", "/site-directory", "/analysis"]) {
      expect(isAdminPreviewPagePath(path)).toBe(true);
    }
    for (const path of ["/api/votes", "/api/admin-page-preview-session", "/admin/results", "/_serverFn", "/__maintenance-admin", "//evil.com", "/%2fapi", "https://example.org"]) {
      expect(isAdminPreviewPagePath(path)).toBe(false);
    }
  });

  it("verifies the Supabase Auth subject and active global Organizer assignment, without service role", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.cache).toBe("no-store");
      expect(init?.headers).toEqual({ apikey: config.publishableKey, authorization: `Bearer ${token}` });
      if (String(input).endsWith("/auth/v1/user")) {
        return Response.json({ id: actor });
      }
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/v1/studio2_role_assignments");
      expect(url.searchParams.get("user_id")).toBe(`eq.${actor}`);
      expect(url.searchParams.get("role_key")).toBe("in.(organizer,superadmin)");
      expect(url.searchParams.get("edition_id")).toBe("is.null");
      expect(url.searchParams.get("limit")).toBe("1");
      return Response.json([{ id: "role" }]);
    });
    expect(await verifyAdminPagePreviewToken(token, config, fetcher as typeof fetch)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed for anonymous, revoked, inaccessible and expired Organizer roles", async () => {
    const cases = [
      [401, 200, [{ id: "role" }]],
      [200, 403, [{ id: "role" }]],
      [200, 200, []],
    ] as const;
    for (const [authStatus, rolesStatus, rows] of cases) {
      const fetcher = vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/auth/v1/user")
          ? Response.json({ id: actor }, { status: authStatus })
          : Response.json(rows, { status: rolesStatus }),
      );
      expect(await verifyAdminPagePreviewToken(token, config, fetcher as typeof fetch)).toBe(false);
    }
    const failClosed = vi.fn(async () => { throw new Error("Supabase unavailable"); });
    expect(await verifyAdminPagePreviewToken(token, config, failClosed as typeof fetch)).toBe(false);
    expect(await verifyAdminPagePreviewToken("not-a-token", config, failClosed as typeof fetch)).toBe(false);
    expect(await verifyAdminPagePreviewToken(token, { ...config, publishableKey: "" }, failClosed as typeof fetch)).toBe(false);
    // The valid-looking token reaches the verifier once and fails closed on network error.
    // The malformed token and absent API key must fail before making a request.
    expect(failClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps the Worker HTTP gate and excludes maintenance and write transports", () => {
    const worker = readFileSync("src/server.ts", "utf8");
    expect(worker).toContain("verifyAdminPagePreviewToken");
    expect(worker).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(worker).toContain("!GLOBAL_MAINTENANCE_MODE && LIMITED_PUBLIC_LAUNCH");
    expect(worker).toContain("!limitedPublicLaunchAllows(url.pathname)");
    expect(worker).toContain('headers.set("cache-control", "private, no-store")');
    expect(worker).toContain('headers.set("x-robots-tag", "noindex, nofollow")');
    expect(worker).toContain("HttpOnly; SameSite=Strict");
  });
});
