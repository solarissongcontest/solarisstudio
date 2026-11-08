import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLOBAL_MAINTENANCE_MODE,
  MAINTENANCE_PLATFORM_PREFLIGHT_PATH,
  MAINTENANCE_PLATFORM_RECOVERY_PATH,
  isMaintenancePlatformRecoveryRouteAllowed,
  isMaintenanceHodAppRouteAllowed,
} from "./maintenance";

const source = (path: string) => readFileSync(path, "utf8");
const server = source("src/server.ts");
const api = source("src/routes/api/maintenance-platform-preflight.ts");
const page = source("src/routes/maintenance/recovery.tsx");
const preflight = source("src/lib/platform-exit-preflight.functions.ts");
const modes = source("src/lib/platform-operational-mode.ts");
const maintenance = source("src/lib/maintenance-page.ts");
const manager = source("src/routes/_authenticated/admin/rules-manager.tsx");
const root = source("src/routes/__root.tsx");
const appRuntime = source("src/components/app/AppRuntime.tsx");

describe("emergency organizer platform recovery lane", () => {
  it("allows only the exact inert GET page and guarded POST preflight", () => {
    expect(GLOBAL_MAINTENANCE_MODE).toBe(true);
    expect(MAINTENANCE_PLATFORM_RECOVERY_PATH).toBe("/maintenance/recovery");
    expect(MAINTENANCE_PLATFORM_PREFLIGHT_PATH).toBe("/api/maintenance-platform-preflight");
    expect(isMaintenancePlatformRecoveryRouteAllowed(MAINTENANCE_PLATFORM_RECOVERY_PATH, "GET")).toBe(true);
    expect(isMaintenancePlatformRecoveryRouteAllowed(MAINTENANCE_PLATFORM_RECOVERY_PATH, "HEAD")).toBe(true);
    expect(isMaintenancePlatformRecoveryRouteAllowed(MAINTENANCE_PLATFORM_PREFLIGHT_PATH, "POST")).toBe(true);

    for (const url of [
      "/_serverFn", "/_serverFn/fake", "/admin/system", "/admin/rules-manager",
      "/api/admin", "/api/maintenance-platform-preflight/", "/maintenance/recovery/",
      "/api/maintenance-confirmation", "/maintenance/other",
    ]) {
      for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        expect(isMaintenancePlatformRecoveryRouteAllowed(url, method)).toBe(false);
      }
    }
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "post"]) {
      expect(isMaintenancePlatformRecoveryRouteAllowed(MAINTENANCE_PLATFORM_PREFLIGHT_PATH, method)).toBe(false);
    }
    expect(isMaintenanceHodAppRouteAllowed("/_serverFn", "POST", true)).toBe(false);
  });

  it("keeps all non-recovery writes behind the original Worker 503 gate", () => {
    expect(server).toContain("!recoveryRouteAllowed");
    expect(server).toContain("!hodAppRouteAllowed");
    expect(server).toContain("!teaserPreviewAllowed");
    expect(server).toContain("request.method !== \"GET\"");
    expect(server).toContain("hasValidMaintenanceBypass");
    expect(server).toContain("if (!sameOrigin(request))");
    expect(server).toContain("MAINTENANCE_PLATFORM_PREFLIGHT_PATH");
    expect(server).toContain('request.headers.get("authorization")');
    expect(server).not.toContain('url.pathname.startsWith("/api/maintenance-")');
  });

  it("uses the existing server-only, organizer- and capability-bound preflight", () => {
    expect(api).toContain('createFileRoute("/api/maintenance-platform-preflight")');
    expect(api).toContain('runProtectedPlatformExitPreflight("degraded")');
    expect(api).toContain("Object.keys(input).length !== 1");
    expect(api).toContain('targetMode !== "degraded"');
    expect(api).not.toContain("studio2_apply_platform_mode_change");
    expect(api).not.toContain("studio2_record_platform_exit_preflight");

    expect(preflight).toContain("export async function runProtectedPlatformExitPreflight");
    expect(preflight).toContain("requireSolarisOrganizerServer");
    expect(preflight).toContain("loadUnifiedSyncHealthServer");
    expect(preflight).toContain("storage.listBuckets()");
    expect(preflight).toContain("studio2_record_platform_exit_preflight");
    expect(preflight).toContain("runProtectedPlatformExitPreflight(data.targetMode)");
  });

  it("requires explicit actor-bound review, fresh R3 auth, and receipt before apply", () => {
    expect(page).toContain('createFileRoute("/maintenance/recovery")');
    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain("supabase.auth.signInWithPassword");
    expect(page).toContain("previewPlatformModeChange");
    expect(page).toContain("receipt.platformVersion !== preview.expectedVersion");
    expect(page).toContain("receipt.ready && Date.parse(receipt.expiresAt) > Date.now()");
    expect(page).toContain("user.user?.id !== pending.actorId");
    expect(page).toContain("reauthenticatePlatformR3(reauthPassword)");
    expect(page).toContain("exitPreflightId: pending.preflight.id");
    expect(page).toContain("applyPlatformModeChange({");
    expect(modes).toContain("p_exit_preflight_id: input.exitPreflightId ?? null");
    expect(page).not.toContain("admin_create_rulebook_release");
    expect(page).not.toContain("admin_publish_rulebook_release");
  });

  it("keeps the recovery page independent of disabled public app work and visibly fails closed", () => {
    expect(root).toContain('maintenanceRecovery = pathname === "/maintenance/recovery"');
    expect(root).toContain("const isolatedRoute = teaserPreview || maintenanceRecovery");
    expect(root).toContain("{maintenanceRecovery ? content : <V3RootLegacyCutover>{content}</V3RootLegacyCutover>}");
    expect(root).toContain("{!isolatedRoute ? <Toaster /> : null}");
    expect(appRuntime).toContain("if (!platform.isAppMode || maintenanceRecovery) return");
    expect(appRuntime).toContain("!platform.canInstallServiceWorker || maintenanceRecovery");
    expect(server).toContain("maintenanceRecoveryFailureResponse(request.method)");
    expect(server).toContain("normalized.status >= 500");
    expect(server).toContain("MAINTENANCE_PLATFORM_RECOVERY_PATH");
    expect(server).toContain("No platform setting or rulebook publication has been changed by this error");
    expect(server).toContain('"cache-control": "private, no-store"');
    expect(server).toContain("form-action 'none'");
    expect(page).toContain("The SSC owner/TSBC approval is recorded");
    // Existing write restrictions stay authoritative even for these fallback paths.
    expect(server).toContain("!recoveryRouteAllowed");
    expect(server).toContain("!hodAppRouteAllowed");
    expect(server).toContain('request.method !== "GET"');
    expect(page).not.toContain("admin_publish_rulebook_release");
  });

  it("explains that recovery does not automatically end emergency Worker maintenance", () => {
    expect(maintenance).toContain('href="/maintenance/recovery"');
    expect(manager).toContain('href="/maintenance/recovery"');
    expect(page).toContain("The separate emergency Worker maintenance gate remains active");
  });
});
