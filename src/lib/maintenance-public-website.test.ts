import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAINTENANCE_MODE,
  isMaintenancePublicWebsiteRouteAllowed,
  maintenancePublicWebsiteEnabled,
  isMaintenanceHodAppRouteAllowed,
} from "./maintenance";

const worker = readFileSync("src/server.ts", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");
const account = readFileSync("src/components/public/PublicEarlyAccessMe.tsx", "utf8");
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8")) as { vars: Record<string, string> };

describe("actual V3 public launch while voting maintenance remains", () => {
  it("requires explicit public launch runtime switch and retains maintenance globally", () => {
    expect(maintenancePublicWebsiteEnabled("true")).toBe(true);
    expect(maintenancePublicWebsiteEnabled(" TRUE ")).toBe(true);
    expect(maintenancePublicWebsiteEnabled("false")).toBe(false);
    expect(maintenancePublicWebsiteEnabled(undefined)).toBe(false);
    expect(GLOBAL_MAINTENANCE_MODE).toBe(true);
    expect(config.vars.PUBLIC_V3_WEBSITE_ACCESS).toBe("true");
    expect(worker).toContain("isMaintenancePublicWebsiteRouteAllowed(");
    expect(worker).toContain("!publicWebsiteRouteAllowed");
    expect(worker).toContain("maintenanceResponse(request, env, url.pathname === \"/\")");
  });

  it("opens the real public V3 destinations for GET and HEAD only", () => {
    for (const path of [
      "/", "/participate", "/me", "/my-solaris",
      "/guide", "/site-directory", "/rules", "/rules/chapters",
      "/rules/answers", "/me", "/my-solaris",
    ]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true), path).toBe(true);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "HEAD", true), path).toBe(true);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", false), path).toBe(false);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "POST", true), path).toBe(false);
    }
  });

  it("never opens official voting, private commands or broader account/edit routes", () => {
    for (const path of [
      "/explore", "/explore/anything", "/results", "/results/ssc-20",
      "/countries", "/countries/ABE", "/editions", "/editions/ssc-20",
      "/shows", "/stories", "/wiki", "/encyclopedia", "/records",
      "/archive", "/calendar", "/library", "/scorecharts", "/analysis", "/tools",
      "/integrity",
      "/admin", "/admin/operations", "/confirmations", "/confirmations/admin",
      "/jury-voting", "/televoting", "/next-in-line",
      "/api/admin", "/api/maintenance-confirmation", "/_serverFn", "/_serverFn/abc",
      "/my-solaris/account", "/my-solaris/country", "/my-solaris/page-builder",
      "/settings", "/beta-test", "/dev", "/participate/jury",
      "/countries-admin", "/auth",
    ]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true), path).toBe(false);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "POST", true), path).toBe(false);
    }
    expect(isMaintenanceHodAppRouteAllowed("/confirmations/edit/token", "GET", true)).toBe(true);
  });

  it("prevents SPA navigation from mounting unreleased components", () => {
    expect(root).toContain("data-maintenance-client-denied");
    expect(root).toContain("maintenanceRouteAllowed");
    expect(root).toContain("PublicEarlyAccessMe");
    expect(root).toContain("GLOBAL_MAINTENANCE_MODE && !localDisposableBrowserAudit && !maintenanceRouteAllowed");
    expect(root).toContain("process.env.SOLARIS_E2E_BYPASS_MAINTENANCE");
    expect(root).toContain("localDisposableSupabase");
    expect(account).toContain("data-public-early-access-me");
    expect(account).not.toContain("MySolarisOperationsPanel");
    expect(account).not.toContain("V3MeRoot");
  });

  it("keeps static maintenance story as an explicit preview rather than public homepage", () => {
    expect(worker).toContain('url.pathname === "/maintenance/story"');
    expect(worker).toContain("return maintenanceResponse(request, env, true)");
    expect(worker).toContain('url.pathname === MAINTENANCE_CONFIRMATION_API_PATH');
    expect(worker).toContain("solaris_studio_maintenance_read_only");
  });
});
