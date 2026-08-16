/** Server-only request helpers (never imported from client code). */
import { getRequestHeader } from "@tanstack/react-start/server";

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
