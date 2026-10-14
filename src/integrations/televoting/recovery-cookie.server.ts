import { getCookie, setCookie } from "@tanstack/react-start/server";

import {
  parseTelevoteRecoveryCode,
  serializeTelevoteRecoveryCode,
  type TelevoteRecoveryHandle,
} from "@/lib/v3-televote-reconciliation";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function recoveryCookieName(roundId: string) {
  // UUIDs contain only token-safe cookie-name characters.
  return `ssc.televote_recovery.${roundId}`;
}

export function writeTelevoteRecoveryCookie(
  roundId: string,
  handle: TelevoteRecoveryHandle,
) {
  const code = serializeTelevoteRecoveryCode(handle);
  if (!code) throw new Error("Invalid vote recovery capability");
  setCookie(recoveryCookieName(roundId), code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // TanStack server functions use an RPC endpoint outside /televoting, so
    // the cookie must be sent site-wide. It remains HttpOnly and its authority
    // is intentionally limited to read-only receipt recovery.
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function readTelevoteRecoveryCookie(roundId: string) {
  const raw = getCookie(recoveryCookieName(roundId));
  return raw ? parseTelevoteRecoveryCode(raw) : null;
}

export function clearTelevoteRecoveryCookie(roundId: string) {
  setCookie(recoveryCookieName(roundId), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
