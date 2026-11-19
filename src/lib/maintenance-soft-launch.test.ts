import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLOBAL_MAINTENANCE_MODE,
  isMaintenanceHodAppRouteAllowed,
  isMaintenancePublicAccountRouteAllowed,
  maintenancePublicAccountAccessEnabled,
} from "./maintenance";

const server = readFileSync("src/server.ts", "utf8");
const authRoute = readFileSync("src/routes/auth/index.tsx", "utf8");
const resetRoute = readFileSync("src/routes/auth/reset.tsx", "utf8");
const accountShell = readFileSync("src/components/SoftLaunchAccountShell.tsx", "utf8");
const workerConfig = JSON.parse(readFileSync("wrangler.jsonc", "utf8")) as {
  vars?: Record<string, string>;
};

describe("public account soft launch remains bounded by maintenance", () => {
  it("requires an explicit true switch", () => {
    expect(maintenancePublicAccountAccessEnabled(undefined)).toBe(false);
    expect(maintenancePublicAccountAccessEnabled("false")).toBe(false);
    expect(maintenancePublicAccountAccessEnabled("1")).toBe(false);
    expect(maintenancePublicAccountAccessEnabled(" TRUE ")).toBe(true);
  });

  it("allows only exact account document GET/HEAD routes", () => {
    const paths = ["/auth", "/auth/", "/auth/reset", "/auth/reset/"];
    for (const path of paths) {
      expect(isMaintenancePublicAccountRouteAllowed(path, "GET", true)).toBe(true);
      expect(isMaintenancePublicAccountRouteAllowed(path, "HEAD", true)).toBe(true);
      expect(isMaintenancePublicAccountRouteAllowed(path, "GET", false)).toBe(false);
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "get"]) {
        expect(isMaintenancePublicAccountRouteAllowed(path, method, true)).toBe(false);
      }
    }
  });

  it("does not expose Organizer, voting, other app routes, or generic writes", () => {
    for (const path of [
      "/", "/admin", "/admin/", "/confirmations", "/confirmations/admin",
      "/jury", "/jury-voting", "/televoting", "/my-solaris", "/participate",
      "/_serverFn", "/_serverFn/a", "/api/anything", "/auth/admin",
      "/auth/anything", "/auth/reset/anything",
    ]) {
      expect(isMaintenancePublicAccountRouteAllowed(path, "GET", true)).toBe(false);
      expect(isMaintenancePublicAccountRouteAllowed(path, "POST", true)).toBe(false);
    }
    expect(GLOBAL_MAINTENANCE_MODE).toBe(true);
    expect(isMaintenanceHodAppRouteAllowed("/confirmations/edit/token", "GET", true)).toBe(true);
    expect(isMaintenancePublicAccountRouteAllowed("/api/maintenance-confirmation", "POST", true)).toBe(false);
  });

  it("connects the public switch to the Worker, not to a generic bypass", () => {
    expect(workerConfig.vars?.PUBLIC_SOFT_LAUNCH_ACCESS).toBe("true");
    expect(server).toContain("maintenancePublicAccountAccessEnabled(");
    expect(server).toContain("isMaintenancePublicAccountRouteAllowed(");
    expect(server).toContain("!publicAccountRouteAllowed");
    expect(server).toContain("status: earlyAccessHome ? 200 : 503");
    expect(server).toContain('href="/auth">Sign in or register</a>');
    expect(server).toContain("maintenanceAdminBypass");
    expect(server).toContain("solaris_studio_maintenance_read_only");
  });

  it("keeps early-access account sessions on an isolated page after sign-in and signup", () => {
    expect(authRoute).toContain('setCompletedAction("signin")');
    expect(authRoute).toContain('setCompletedAction("signup")');
    expect(authRoute).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(authRoute).toContain("<SoftLaunchAccountShell>");
    expect(resetRoute).toContain("setCompleted(true)");
    expect(accountShell).toContain("data-soft-launch-account-shell");
    expect(accountShell).not.toContain("PublicDrawerNavigation");
  });
});
