export const GLOBAL_MAINTENANCE_MODE = true;

export const MAINTENANCE_RETURN_DATE = "15 November 2026";
export const MAINTENANCE_LAST_UPDATED = "29 October 2026";
// Public estimate only. The maintenance/release gate remains authoritative.
export const TERRAOS3_ESTIMATED_LAUNCH_AT = "2026-11-15T20:00:00+02:00";
export const MAINTENANCE_CONFIRMATION_API_PATH = "/api/maintenance-confirmation";

export function maintenanceHodAccessEnabled(rawValue: string | null | undefined) {
  return rawValue?.trim().toLowerCase() === "true";
}

export function isMaintenanceHodAppRouteAllowed(
  pathname: string,
  method: string,
  enabled: boolean,
) {
  if (!enabled) return false;

  // The maintenance Confirmation editor gets one exact POST transport. Never
  // open TanStack's generic /_serverFn surface while global maintenance is on.
  if (pathname === MAINTENANCE_CONFIRMATION_API_PATH) return method === "POST";

  if (method !== "GET" && method !== "HEAD") return false;

  if (/^\/confirmations\/edit\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname === "/confirmations/recover" || pathname === "/confirmations/recover/") return true;
  if (pathname === "/auth/reset" || pathname === "/auth/reset/") return true;

  return false;
}

/**
 * This is the sole public maintenance exception for authenticated platform
 * recovery. The GET document is inert until a real Solaris organizer signs in.
 * The POST transport only records protected, server-attested exit preflights.
 * Normal writes, Rules Manager mutations and generic server functions stay
 * blocked by the emergency Worker gate.
 */
export const MAINTENANCE_PLATFORM_RECOVERY_PATH = "/maintenance/recovery";
export const MAINTENANCE_PLATFORM_PREFLIGHT_PATH = "/api/maintenance-platform-preflight";

export function isMaintenancePlatformRecoveryRouteAllowed(pathname: string, method: string) {
  if (pathname === MAINTENANCE_PLATFORM_RECOVERY_PATH) {
    return method === "GET" || method === "HEAD";
  }
  return pathname === MAINTENANCE_PLATFORM_PREFLIGHT_PATH && method === "POST";
}
