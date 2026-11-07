import { describe, expect, it } from "vitest";

import {
  MAX_RECOVERY_BODY_BYTES,
  readBoundedRecoveryBody,
} from "./maintenance-recovery-body";

const endpoint = "http://127.0.0.1:4173/api/maintenance-platform-preflight";

function post(body: string, contentLength?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Request(endpoint, { method: "POST", headers, body });
}

describe("emergency platform recovery transport byte budget (no network)", () => {
  it("accepts at most 512 bytes of valid UTF-8, not 512 characters", async () => {
    expect(MAX_RECOVERY_BODY_BYTES).toBe(512);
    expect(await readBoundedRecoveryBody(post(" ".repeat(512)))).toEqual({
      ok: true,
      text: " ".repeat(512),
    });
    expect(await readBoundedRecoveryBody(post(" ".repeat(513)))).toEqual({
      ok: false,
      error: "request_too_large",
      status: 413,
    });
    // The old Request.text().length check incorrectly admitted this 514-byte body.
    expect(await readBoundedRecoveryBody(post("é".repeat(257)))).toEqual({
      ok: false,
      error: "request_too_large",
      status: 413,
    });
  });

  it("rejects a huge Content-Length before reading a small body", async () => {
    expect(await readBoundedRecoveryBody(post("{}", "1000000"))).toEqual({
      ok: false,
      error: "request_too_large",
      status: 413,
    });
    expect(await readBoundedRecoveryBody(post("{}", "not-a-number"))).toEqual({
      ok: false,
      error: "invalid_json",
      status: 400,
    });
    expect(await readBoundedRecoveryBody(post("{}", "2"))).toEqual({
      ok: true,
      text: "{}",
    });
  });

  it("fails closed on an oversized streamed request with no Content-Length", async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(260));
        if (pulls === 10) controller.close();
      },
    });
    const request = new Request(endpoint, {
      method: "POST",
      body: source,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(request.headers.has("content-length")).toBe(false);
    expect(await readBoundedRecoveryBody(request)).toEqual({
      ok: false,
      error: "request_too_large",
      status: 413,
    });
    expect(pulls).toBeLessThan(10);
  });

  it("rejects malformed UTF-8 rather than accepting replacement characters", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    });
    const request = new Request(endpoint, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedRecoveryBody(request)).toEqual({
      ok: false,
      error: "invalid_json",
      status: 400,
    });
  });

  it("handles a missing body without inventing a valid command", async () => {
    expect(await readBoundedRecoveryBody(new Request(endpoint, { method: "POST" }))).toEqual({
      ok: true,
      text: "",
    });
    // The route still applies strict JSON parsing, schema and authorization.
  });
});
