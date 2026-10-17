import { resolveEditToken } from "@/lib/confirmation-edit.functions";
import { checkEntryDuplicate, submitConfirmation } from "@/lib/public.functions";

export const GLOBAL_MAINTENANCE_MODE = true;

export const MAINTENANCE_RETURN_DATE = "To be announced";
export const MAINTENANCE_LAST_UPDATED = "18 October 2026";

const MAINTENANCE_HOD_SERVER_FN_PATHS = new Set(
  [resolveEditToken.url, checkEntryDuplicate.url, submitConfirmation.url].map((value) => {
    try {
      return new URL(value, "https://solaris.invalid").pathname;
    } catch {
      return value;
    }
  }),
);

export function maintenanceHodAccessEnabled(rawValue: string | null | undefined) {
  return rawValue?.trim().toLowerCase() === "true";
}

export function isMaintenanceHodAppRouteAllowed(
  pathname: string,
  method: string,
  enabled: boolean,
) {
  if (!enabled) return false;

  // Server functions are independent RPC endpoints. During global maintenance
  // the HOD editor may call only the three functions needed to resolve an
  // already-issued edit token, check Entry duplicates, and save that same
  // existing Confirmation. All other /_serverFn/* endpoints stay behind the
  // maintenance wall. TanStack's normal same-origin/CSRF checks still apply.
  if (method === "POST" && MAINTENANCE_HOD_SERVER_FN_PATHS.has(pathname)) {
    return true;
  }

  if (method !== "GET" && method !== "HEAD") return false;

  if (/^\/confirmations\/edit\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname === "/confirmations/recover" || pathname === "/confirmations/recover/") return true;
  if (pathname === "/auth/reset" || pathname === "/auth/reset/") return true;

  return false;
}
