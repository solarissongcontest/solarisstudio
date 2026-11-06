export type OrganizerOperationErrorClass =
  | "connection"
  | "validation"
  | "permission"
  | "state_changed"
  | "conflict"
  | "uncertain"
  | "server_failure";

export type OrganizerOperationPhase =
  | "pending"
  | "reconciling"
  | "success"
  | "partial"
  | "failed"
  | "conflict";

export type OrganizerOperationContext = {
  editionLabel?: string | null;
  showLabel?: string | null;
  subjectLabel?: string | null;
};

export type OrganizerOperationDiagnostics = {
  errorCode?: string;
  operationId?: string;
  correlationId?: string;
  receiptId?: string;
  stateVersion?: string | number;
  serverTime?: string;
};

export type OrganizerOperationPartialFailure = {
  id?: string;
  label: string;
  reason: string;
};

export type OrganizerOperationReceiptSummary = {
  receiptId: string;
  operationId: string;
  summary: string;
  outcome: "success" | "partial" | "failed";
  completedAt?: string;
  affectedCount?: number;
  beforeVersion?: string | number;
  afterVersion?: string | number;
};

export type OrganizerOperationFeedback = {
  phase: OrganizerOperationPhase;
  title?: string;
  message?: string;
  errorClass?: OrganizerOperationErrorClass;
  context?: OrganizerOperationContext;
  diagnostics?: OrganizerOperationDiagnostics;
  receipt?: OrganizerOperationReceiptSummary;
  partialFailures?: readonly OrganizerOperationPartialFailure[];
  reviewedVersion?: string | number;
  currentVersion?: string | number;
};

export type OrganizerOperationAction = "retry" | "reconcile" | "reload" | "compare";

const PERMISSION_CODES = new Set(["AUTHORIZATION", "PERMISSION_DENIED", "42501"]);
const VALIDATION_CODES = new Set(["VALIDATION", "VALIDATION_FAILED", "22023"]);
const STATE_CHANGED_CODES = new Set(["STATE_CHANGED", "ROUND_CLOSED", "WINDOW_CLOSED", "25006"]);
const CONFLICT_CODES = new Set(["VERSION_CONFLICT", "REVISION_CONFLICT", "STATE_VERSION_CONFLICT", "PT409", "409"]);

// A connection failure is only safely retryable when the transport proves that
// no request reached the authoritative command boundary. Generic timeout/fetch/
// connection-loss codes are deliberately *not* in this set because the commit
// may have happened before the response disappeared.
const CONFIRMED_NOT_SENT_CODES = new Set([
  "NETWORK_UNREACHABLE",
  "REQUEST_NOT_SENT",
  "DNS_RESOLUTION_FAILED",
]);

const UNCERTAIN_CODES = new Set([
  "UNKNOWN_OUTCOME",
  "OPERATION_UNCERTAIN",
  "RESPONSE_LOST",
  "TIMEOUT",
  "CONNECTION_LOST",
  "FETCH_FAILED",
  "NETWORK_ERROR",
]);

function normalizedCode(code: unknown) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

/**
 * Fallback UX classification for adapters that only have a stable error code.
 * Server/domain state remains authoritative; this helper never decides whether
 * an operation succeeded or whether a transition is valid.
 *
 * Ambiguous transport failures fail closed as `uncertain`. A caller may only
 * receive the retryable `connection` class from a code that explicitly proves
 * the request was not sent to the authoritative command boundary.
 */
export function classifyOrganizerOperationError(code: unknown): OrganizerOperationErrorClass {
  const normalized = normalizedCode(code);
  if (PERMISSION_CODES.has(normalized)) return "permission";
  if (VALIDATION_CODES.has(normalized)) return "validation";
  if (STATE_CHANGED_CODES.has(normalized)) return "state_changed";
  if (CONFLICT_CODES.has(normalized)) return "conflict";
  if (CONFIRMED_NOT_SENT_CODES.has(normalized)) return "connection";
  if (UNCERTAIN_CODES.has(normalized)) return "uncertain";
  return "server_failure";
}

export function organizerOperationDefaultCopy(errorClass: OrganizerOperationErrorClass) {
  switch (errorClass) {
    case "connection":
      return {
        title: "Couldn't reach Solaris",
        message: "The request was not sent. Check the connection and try again only while the action is still valid.",
      };
    case "validation":
      return {
        title: "One item needs your attention",
        message: "Review the highlighted requirement before trying again.",
      };
    case "permission":
      return {
        title: "You don't have access to this action",
        message: "Your Organizer permissions may have changed. Reload authoritative access before continuing.",
      };
    case "state_changed":
      return {
        title: "The state changed",
        message: "Solaris has newer authoritative state. Reload it before deciding what to do next.",
      };
    case "conflict":
      return {
        title: "This changed while you were working",
        message: "Your review is based on an older version. Compare or reload the current version instead of overwriting it.",
      };
    case "uncertain":
      return {
        title: "Checking operation status…",
        message: "The request may already have committed. Reconcile the existing operation before any retry.",
      };
    case "server_failure":
      return {
        title: "Solaris couldn't complete this action",
        message: "The operation failed on the server. Retry only when the failure is confirmed and the action is still valid.",
      };
  }
}

export function organizerOperationAllowedActions(
  feedback: Pick<OrganizerOperationFeedback, "phase" | "errorClass" | "reviewedVersion" | "currentVersion">,
): readonly OrganizerOperationAction[] {
  if (feedback.phase === "reconciling" || feedback.errorClass === "uncertain") {
    return ["reconcile"];
  }

  if (feedback.phase === "conflict" || feedback.errorClass === "conflict") {
    const actions: OrganizerOperationAction[] = [];
    if (feedback.reviewedVersion != null && feedback.currentVersion != null) actions.push("compare");
    actions.push("reload");
    return actions;
  }

  if (feedback.errorClass === "state_changed" || feedback.errorClass === "permission") {
    return ["reload"];
  }

  if (feedback.phase === "failed") {
    if (feedback.errorClass === "validation") return [];
    return ["retry"];
  }

  return [];
}

/**
 * Pick only diagnostics that are explicitly safe for Organizer UI. Callers may
 * pass richer error/receipt records; stack traces, payloads, tokens and arbitrary
 * metadata are intentionally discarded.
 */
export function selectOrganizerOperationDiagnostics(
  input: Record<string, unknown> | null | undefined,
): OrganizerOperationDiagnostics {
  if (!input) return {};

  const diagnostics: OrganizerOperationDiagnostics = {};
  const errorCode = input.errorCode ?? input.code;
  const operationId = input.operationId;
  const correlationId = input.correlationId;
  const receiptId = input.receiptId;
  const stateVersion = input.stateVersion;
  const serverTime = input.serverTime;

  if (typeof errorCode === "string" && errorCode.trim()) diagnostics.errorCode = errorCode.trim();
  if (typeof operationId === "string" && operationId.trim()) diagnostics.operationId = operationId.trim();
  if (typeof correlationId === "string" && correlationId.trim()) diagnostics.correlationId = correlationId.trim();
  if (typeof receiptId === "string" && receiptId.trim()) diagnostics.receiptId = receiptId.trim();
  if (typeof stateVersion === "string" || typeof stateVersion === "number") diagnostics.stateVersion = stateVersion;
  if (typeof serverTime === "string" && serverTime.trim()) diagnostics.serverTime = serverTime.trim();

  return diagnostics;
}

export function organizerOperationContextLabel(context?: OrganizerOperationContext) {
  if (!context) return null;
  const scope = [context.editionLabel, context.showLabel].filter(Boolean).join(" · ");
  if (context.subjectLabel && scope) return `${scope} · ${context.subjectLabel}`;
  return context.subjectLabel ?? (scope || null);
}

export function buildOrganizerOperationFailure(input: {
  code?: string;
  phase?: "failed" | "conflict" | "reconciling";
  context?: OrganizerOperationContext;
  diagnostics?: Record<string, unknown>;
  message?: string;
  reviewedVersion?: string | number;
  currentVersion?: string | number;
}): OrganizerOperationFeedback {
  const diagnosticInput = input.diagnostics ?? {};
  const errorClass =
    input.phase === "reconciling"
      ? "uncertain"
      : input.phase === "conflict"
        ? "conflict"
        : classifyOrganizerOperationError(input.code ?? diagnosticInput.errorCode ?? diagnosticInput.code);
  const copy = organizerOperationDefaultCopy(errorClass);

  return {
    phase:
      input.phase ??
      (errorClass === "conflict" ? "conflict" : errorClass === "uncertain" ? "reconciling" : "failed"),
    title: copy.title,
    message: input.message?.trim() || copy.message,
    errorClass,
    context: input.context,
    diagnostics: selectOrganizerOperationDiagnostics({
      ...diagnosticInput,
      errorCode: input.code ?? diagnosticInput.errorCode,
    }),
    reviewedVersion: input.reviewedVersion,
    currentVersion: input.currentVersion,
  };
}

export function buildOrganizerOperationSuccess(input: {
  receipt: OrganizerOperationReceiptSummary;
  context?: OrganizerOperationContext;
  diagnostics?: Record<string, unknown>;
  partialFailures?: readonly OrganizerOperationPartialFailure[];
}): OrganizerOperationFeedback {
  const partialFailures = input.partialFailures ?? [];
  const partial = input.receipt.outcome === "partial" || partialFailures.length > 0;

  return {
    phase: partial ? "partial" : "success",
    title: partial ? "Completed with exceptions" : "Operation complete",
    message: input.receipt.summary,
    context: input.context,
    receipt: input.receipt,
    partialFailures,
    diagnostics: selectOrganizerOperationDiagnostics({
      ...(input.diagnostics ?? {}),
      operationId: input.receipt.operationId,
      receiptId: input.receipt.receiptId,
    }),
  };
}
