import type { AppErrorKind } from "@/lib/app-error-state";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

const PUBLIC_UX_ERROR_CLASSES = new Set<AppErrorKind>([
  "offline",
  "service-unavailable",
  "authentication-expired",
  "permission-denied",
  "conflict",
  "not-found",
  "unpublished",
  "request-failed",
  "unexpected",
]);

function safePublicUxErrorClass(value: unknown): AppErrorKind | null {
  if (typeof value !== "string") return null;
  return PUBLIC_UX_ERROR_CLASSES.has(value as AppErrorKind) ? (value as AppErrorKind) : null;
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // The root public error boundary supplies only Solaris's existing
  // low-cardinality AppErrorKind. Record that class separately from Lovable's
  // detailed developer report: never send the error message, stack, response
  // body or arbitrary context into Public UX telemetry.
  const publicErrorClass = safePublicUxErrorClass(context.app_error_kind);
  if (publicErrorClass) {
    trackPublicUxEvent("public_error_shown", {
      metadata: {
        error_class: publicErrorClass,
        source: "root_error_boundary",
      },
    });
  }

  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  window.__lovableReportRuntimeError?.({
    message,
    stack: error instanceof Error ? error.stack : undefined,
    filename: window.location.pathname,
  });
}
