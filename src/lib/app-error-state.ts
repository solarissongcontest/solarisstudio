import { isSupabaseServiceRestrictionError } from "@/lib/supabase-service-restriction";

export type AppErrorKind =
  | "offline"
  | "service-unavailable"
  | "authentication-expired"
  | "permission-denied"
  | "not-found"
  | "unpublished"
  | "request-failed"
  | "unexpected";

export type AppErrorPresentation = {
  kind: AppErrorKind;
  eyebrow: string;
  title: string;
  description: string;
  retry: boolean;
  primaryLabel?: string;
  primaryHref?: string;
};

function errorRecord(error: unknown) {
  if (!error || typeof error !== "object") return {} as Record<string, unknown>;
  return error as Record<string, unknown>;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  const value = errorRecord(error);
  return String(value.message ?? value.error_description ?? value.details ?? "");
}

function errorStatus(error: unknown) {
  const value = errorRecord(error);
  const status = Number(value.status ?? value.statusCode ?? value.httpStatusCode ?? value.code);
  return Number.isFinite(status) ? status : null;
}

export function classifyAppError(error: unknown, online = true): AppErrorKind {
  if (!online) return "offline";
  if (isSupabaseServiceRestrictionError(error)) return "service-unavailable";

  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();

  if (
    status === 401 ||
    /jwt.*expired|token.*expired|session.*expired|refresh token.*invalid/.test(message)
  ) {
    return "authentication-expired";
  }
  if (status === 403 || /permission denied|not authorized|forbidden/.test(message)) {
    return "permission-denied";
  }
  if (status === 404 || /not found/.test(message)) return "not-found";
  if (/not published|unpublished|results? (?:is|are) not public/.test(message)) {
    return "unpublished";
  }
  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/.test(
      message,
    )
  ) {
    return "request-failed";
  }

  return "unexpected";
}

export function appErrorPresentation(kind: AppErrorKind): AppErrorPresentation {
  switch (kind) {
    case "offline":
      return {
        kind,
        eyebrow: "Connection",
        title: "You're offline",
        description:
          "Solaris could not refresh this view. Previously downloaded information may still be available elsewhere in the app.",
        retry: true,
      };
    case "service-unavailable":
      return {
        kind,
        eyebrow: "Data service",
        title: "Solaris data is temporarily unavailable",
        description:
          "Published or cached areas may still work, but database-backed reads and saves can fail until the service recovers.",
        retry: true,
      };
    case "authentication-expired":
      return {
        kind,
        eyebrow: "Session",
        title: "Your session expired",
        description:
          "Sign in again before continuing account or participation work. Local drafts remain separate from a server submission.",
        retry: false,
        primaryLabel: "Sign in again",
        primaryHref: "/auth",
      };
    case "permission-denied":
      return {
        kind,
        eyebrow: "Access",
        title: "You don't have access to this view",
        description:
          "Your current Solaris account does not have permission for this action or page.",
        retry: false,
      };
    case "not-found":
      return {
        kind,
        eyebrow: "404",
        title: "This page wasn't found",
        description: "The link may be outdated, private, or no longer available.",
        retry: false,
      };
    case "unpublished":
      return {
        kind,
        eyebrow: "Publication",
        title: "This isn't public yet",
        description:
          "Solaris will show this information after the relevant contest stage is officially published.",
        retry: false,
      };
    case "request-failed":
      return {
        kind,
        eyebrow: "Connection",
        title: "Solaris couldn't refresh this view",
        description:
          "The request did not complete. Your existing server data has not been changed by this failed load.",
        retry: true,
      };
    default:
      return {
        kind: "unexpected",
        eyebrow: "Solaris Studio",
        title: "This page didn't load",
        description:
          "An unexpected error interrupted this view. Other Solaris areas remain available.",
        retry: true,
      };
  }
}
