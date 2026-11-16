export async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export async function verifyPublishedBlob(
  blob: Blob,
  expected: { size: number; sha256: string },
) {
  if (blob.size !== expected.size) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return (await sha256Hex(bytes)) === expected.sha256;
}
