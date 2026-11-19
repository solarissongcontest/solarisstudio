import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLOBAL_MAINTENANCE_MODE,
  isMaintenancePublicAccountRouteAllowed,
  isMaintenancePublicWebsiteRouteAllowed,
} from "./maintenance";

const root = readFileSync("src/routes/__root.tsx", "utf8");
const me = readFileSync("src/components/public/PublicEarlyAccessMe.tsx", "utf8");
const auth = readFileSync("src/routes/auth/index.tsx", "utf8");
const worker = readFileSync("src/server.ts", "utf8");

describe("public release login remains usable after session changes", () => {
  it("renders auth and Me without app-wide background services", () => {
    expect(GLOBAL_MAINTENANCE_MODE).toBe(false);
    for (const path of ["/auth", "/auth/", "/auth/reset", "/auth/reset/"]) {
      expect(isMaintenancePublicAccountRouteAllowed(path, "GET", true)).toBe(true);
    }
    for (const path of ["/me", "/me/", "/my-solaris", "/my-solaris/"]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true)).toBe(true);
    }
    expect(root).toContain("const accountPath =");
    expect(root).toContain("const mePath =");
    expect(root).toContain("{mePath ? <PublicEarlyAccessMe /> : outlet}");
    expect(root.indexOf("const accountPath =")).toBeLessThan(
      root.indexOf("<AccountCacheIsolation />"),
    );
    expect(root).toContain("GLOBAL_MAINTENANCE_MODE && !localDisposableBrowserAudit");
  });

  it("renders a useful Me account page even before or after session restore fails", () => {
    expect(me).toContain("data-public-early-access-me");
    expect(me).toContain("Opening your account");
    expect(me).toContain("Session unavailable");
    expect(me).toContain("You're signed in");
    expect(me).toContain('href="/auth"');
    expect(me).toContain('href="/confirmations/recover"');
    expect(me).toContain("supabase.auth.onAuthStateChange(");
    expect(me).toContain("supabase.auth.getSession()");
    expect(me).not.toContain("<AppShell>");
    expect(me).not.toContain("useMyCountryAccount");
    expect(me).not.toContain("getCurrentAccountAccess");
  });

  it("preserves explicit auth success and server maintenance boundaries", () => {
    expect(auth).toContain('setCompletedAction("signin")');
    expect(auth).toContain('setCompletedAction("signup")');
    expect(worker).toContain("!hodAppRouteAllowed");
    expect(worker).toContain("!publicWebsiteRouteAllowed");
    expect(isMaintenancePublicWebsiteRouteAllowed("/jury-voting", "GET", true)).toBe(false);
    expect(isMaintenancePublicWebsiteRouteAllowed("/admin", "GET", true)).toBe(false);
    expect(isMaintenancePublicWebsiteRouteAllowed("/_serverFn/a", "POST", true)).toBe(false);
  });
});
