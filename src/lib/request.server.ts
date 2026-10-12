/** Server-only request helpers (never imported from client code). */
import {
  getCookie,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";

const CONFIRMATION_OPERATION_EPOCH_COOKIE = "ssc.confirmation_operation_epoch";
const CONFIRMATION_OPERATION_EPOCH_MAX_AGE_SECONDS = 60 * 60 * 24;

/** Best-effort originating IP of the current request. */
export function getClientIp(): string | null {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for"),
  ];
  for (const value of candidates) {
    if (!value) continue;
    const first = value.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function writeConfirmationOperationEpoch(value: string) {
  setCookie(CONFIRMATION_OPERATION_EPOCH_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONFIRMATION_OPERATION_EPOCH_MAX_AGE_SECONDS,
  });
}

/**
 * Acknowledged requests rotate this server-managed epoch. If the response is
 * lost after the database committed, the browser never receives the Set-Cookie
 * rotation and therefore derives the same idempotency key on retry.
 */
export function getOrCreateConfirmationOperationEpoch() {
  const existing = getCookie(CONFIRMATION_OPERATION_EPOCH_COOKIE)?.trim();
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const created = crypto.randomUUID();
  writeConfirmationOperationEpoch(created);
  return created;
}

export function rotateConfirmationOperationEpoch() {
  const next = crypto.randomUUID();
  writeConfirmationOperationEpoch(next);
  return next;
}

export async function deriveConfirmationIdempotencyKey(
  epoch: string,
  logicalRequest: string,
) {
  const digest = await sha256Hex(`${epoch}\n${logicalRequest}`);
  // PostgreSQL UUID accepts deterministic 128-bit hex identifiers. The full
  // SHA-256 remains unnecessary here because the database independently hashes
  // the logical payload and rejects key reuse with different request content.
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}
