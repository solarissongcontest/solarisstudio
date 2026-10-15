import {
  SYSTEM_ERROR_CODES,
  type SystemError,
  type SystemErrorCode,
  type SystemErrorMetadataValue,
} from "@/lib/system-operation-contract";

const ERROR_CODES = new Set<string>(SYSTEM_ERROR_CODES);

const SAFE_MESSAGES: Readonly<Record<SystemErrorCode, string>> = {
  AUTHENTICATION: "Your session has expired. Sign in again, then continue.",
  AUTHORIZATION: "You do not have permission to perform this action.",
  VALIDATION: "Some information is invalid. Review the form and try again.",
  STATE_CHANGED: "The current state changed. Refresh and review it before continuing.",
  VERSION_CONFLICT:
    "This item changed while you were editing it. Review the latest version before continuing.",
  IDEMPOTENCY_CONFLICT:
    "This request identity was already used for a different action. Start the action again.",
  RATE_LIMIT: "Too many requests were made. Wait a moment, then try again.",
  DEPENDENCY_FAILURE: "A required service is temporarily unavailable. Try again shortly.",
  DATABASE: "The operation could not be saved safely. Try again shortly.",
  STORAGE: "The file operation could not be completed. Check the file and try again.",
  TIMEOUT: "The result is not yet confirmed. Check the operation status before trying again.",
  UNKNOWN: "Something went wrong. Check the operation status before trying again.",
};

const RETRYABLE: Readonly<Record<SystemErrorCode, boolean>> = {
  AUTHENTICATION: false,
  AUTHORIZATION: false,
  VALIDATION: false,
  STATE_CHANGED: false,
  VERSION_CONFLICT: false,
  IDEMPOTENCY_CONFLICT: false,
  RATE_LIMIT: true,
  DEPENDENCY_FAILURE: true,
  DATABASE: true,
  STORAGE: true,
  TIMEOUT: true,
  UNKNOWN: false,
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export function isSystemErrorCode(value: unknown): value is SystemErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}

export function systemErrorCodeFromUnknown(error: unknown): SystemErrorCode | null {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? codeFromText(error) : null;
  }

  const candidate = error as ErrorLike;
  const explicit = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .map((value) => (typeof value === "string" ? codeFromText(value) : null))
    .find((value): value is SystemErrorCode => value !== null);
  if (explicit) return explicit;

  const status = numericStatus(candidate.status ?? candidate.statusCode);
  if (status === 401) return "AUTHENTICATION";
  if (status === 403) return "AUTHORIZATION";
  if (status === 409) return "STATE_CHANGED";
  if (status === 422 || status === 400) return "VALIDATION";
  if (status === 429) return "RATE_LIMIT";
  if (status !== null && status >= 500) return "DEPENDENCY_FAILURE";

  const sqlState = typeof candidate.code === "string" ? candidate.code : "";
  if (["23503", "23505", "23514", "22023"].includes(sqlState)) return "VALIDATION";
  if (["40001", "40P01", "P0002", "PGRST116"].includes(sqlState)) return "STATE_CHANGED";
  if (sqlState === "42501") return "AUTHORIZATION";
  if (sqlState === "PGRST301") return "AUTHENTICATION";

  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (/JWT|token is expired|not authenticated/i.test(message)) return "AUTHENTICATION";
  if (/timed? out|timeout/i.test(message)) return "TIMEOUT";
  if (/storage|bucket|object upload/i.test(message)) return "STORAGE";
  if (/failed to fetch|networkerror|fetch failed|service unavailable/i.test(message)) {
    return "DEPENDENCY_FAILURE";
  }

  return null;
}

export function createSystemError(
  code: SystemErrorCode,
  metadata?: Readonly<Record<string, unknown>> | null,
): SystemError {
  const safeMetadata = sanitizeSystemErrorMetadata(metadata);
  return {
    code,
    message: SAFE_MESSAGES[code],
    retryable: RETRYABLE[code],
    ...(safeMetadata ? { metadata: safeMetadata } : {}),
  };
}

export function toSystemError(
  error: unknown,
  fallbackCode: SystemErrorCode = "UNKNOWN",
): SystemError {
  return createSystemError(systemErrorCodeFromUnknown(error) ?? fallbackCode);
}

export function sanitizeSystemErrorMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, SystemErrorMetadataValue>> | undefined {
  if (!metadata) return undefined;

  const entries = Object.entries(metadata).slice(0, 12);
  const safe: Record<string, SystemErrorMetadataValue> = {};
  for (const [rawKey, value] of entries) {
    const key = rawKey.trim().slice(0, 64);
    if (!key) continue;
    if (typeof value === "string") safe[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean" || value === null) safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function codeFromText(value: string): SystemErrorCode | null {
  const normalized = value.trim().toUpperCase();
  if (isSystemErrorCode(normalized)) return normalized;
  return (
    SYSTEM_ERROR_CODES.find((code) =>
      new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(normalized),
    ) ?? null
  );
}

function numericStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
  return null;
}
