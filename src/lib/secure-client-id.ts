/**
 * Browser-only, unpredictable identifier for draft sessions and optional telemetry.
 * Never fall back to Math.random: confirmation reconciliation is security-sensitive.
 * Returns an empty string if no cryptographically secure generator is available.
 */
export function createSecureClientId(): string {
  try {
    if (typeof globalThis.crypto === "undefined") return "";
    // randomUUID can be unavailable or throw outside a secure browser context.
    // getRandomValues remains a secure fallback in older browsers.
    try {
      if (typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
    } catch {
      // Try the cryptographic byte generator below.
    }
    if (typeof globalThis.crypto.getRandomValues !== "function") return "";

    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return "";
  }
}
