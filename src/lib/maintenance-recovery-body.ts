/**
 * Strict, bounded transport reader for the one allowlisted emergency recovery POST.
 *
 * Do not call Request.text() here: an attacker can omit Content-Length and make
 * the Worker buffer a large streamed body before the route's size check.
 * Read and retain at most MAX_RECOVERY_BODY_BYTES of untrusted request data.
 */
export const MAX_RECOVERY_BODY_BYTES = 512;

export type BoundedRecoveryBody =
  | { ok: true; text: string }
  | { ok: false; error: "request_too_large" | "invalid_json"; status: 413 | 400 };

export async function readBoundedRecoveryBody(
  request: Request,
): Promise<BoundedRecoveryBody> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
      return { ok: false, error: "invalid_json", status: 400 };
    }
    if (Number(declaredLength) > MAX_RECOVERY_BODY_BYTES) {
      return { ok: false, error: "request_too_large", status: 413 };
    }
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      receivedBytes += next.value.byteLength;
      if (receivedBytes > MAX_RECOVERY_BODY_BYTES) {
        // Stop consuming the stream as soon as it crosses the byte budget.
        await reader.cancel("Maintenance recovery request exceeded its byte limit");
        return { ok: false, error: "request_too_large", status: 413 };
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "invalid_json", status: 400 };
  }
}
