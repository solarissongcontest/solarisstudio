export const GLOBAL_MAINTENANCE_MODE = true;

/** Public account access while the rest of the application remains under maintenance. */
export function maintenancePublicAccountAccessEnabled(rawValue: string | null | undefined) {
  return rawValue?.trim().toLowerCase() === "true";
}

/** Only account screens may render. No generic POST or application API routes. */
export function isMaintenancePublicAccountRouteAllowed(
  pathname: string,
  method: string,
  enabled: boolean,
) {
  if (!enabled || (method !== "GET" && method !== "HEAD")) return false;
  return pathname === "/auth" || pathname === "/auth/" || pathname === "/auth/reset" || pathname === "/auth/reset/";
}


/**
 * The real public V3 website can be served during emergency maintenance without
 * granting any new mutation transport. The runtime switch is separate from the
 * account-only switch and defaults to CLOSED if absent.
 */
export function maintenancePublicWebsiteEnabled(rawValue: string | null | undefined) {
  return rawValue?.trim().toLowerCase() === "true";
}

/**
 * The emergency public release has exactly three top-level experiences.
 * Login/signup and token-authorized Confirmation editing use separate routes.
 * Do not accidentally publish Explore, Results or archive detail URLs.
 */
export const MAINTENANCE_PUBLIC_PRIMARY_AREAS = ["home", "participate", "me"] as const;

export function isMaintenancePublicWebsiteRouteAllowed(
  pathname: string,
  method: string,
  enabled: boolean,
) {
  if (!enabled || (method !== "GET" && method !== "HEAD")) return false;
  return pathname === "/" ||
    pathname === "/participate" || pathname === "/participate/" ||
    pathname === "/me" || pathname === "/me/" ||
    pathname === "/my-solaris" || pathname === "/my-solaris/";
}

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
