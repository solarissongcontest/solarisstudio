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
